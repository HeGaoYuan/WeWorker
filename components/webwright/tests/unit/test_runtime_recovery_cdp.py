from __future__ import annotations

import asyncio
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from webwright.tool_runtime.toolkit_runtime import (
    FileRuntimeStore,
    PublishedToolkitRunner,
    find_page_by_target_id,
    is_cdp_available,
)


pytestmark = pytest.mark.skipif(
    os.environ.get("WEBWRIGHT_RUN_RUNTIME_RECOVERY_CDP_E2E") != "1",
    reason="Set WEBWRIGHT_RUN_RUNTIME_RECOVERY_CDP_E2E=1 to launch an isolated CDP browser.",
)


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = b"<html><title>Runtime recovery</title><body>ready</body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        del format, args


def _free_port() -> int:
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return int(candidate.getsockname()[1])


def _wait_for_cdp(cdp_url: str, *, available: bool, timeout_seconds: float = 10) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if is_cdp_available(cdp_url) is available:
            return
        time.sleep(0.1)
    raise AssertionError(f"CDP availability did not become {available}: {cdp_url}")


async def _close_target(cdp_url: str, target_id: str) -> None:
    from playwright.async_api import async_playwright

    manager = await async_playwright().start()
    try:
        browser = await manager.chromium.connect_over_cdp(cdp_url)
        context = browser.contexts[0]
        page = await find_page_by_target_id(context, target_id)
        assert page is not None
        await page.close()
    finally:
        await manager.stop()


async def _close_browser(cdp_url: str) -> None:
    from playwright.async_api import async_playwright

    manager = await async_playwright().start()
    try:
        browser = await manager.chromium.connect_over_cdp(cdp_url)
        session = await browser.new_browser_cdp_session()
        try:
            await session.send("Browser.close")
        except Exception:
            pass
    finally:
        await manager.stop()


def test_published_runtime_recovers_closed_target_and_browser(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cdp_url = f"http://127.0.0.1:{_free_port()}"
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    start_url = f"http://127.0.0.1:{server.server_port}/"
    toolkit_dir = tmp_path / "toolkit"
    toolkit_dir.mkdir()
    (toolkit_dir / "runtime.json").write_text("{}\n", encoding="utf-8")
    tool_specs = {
        "probe": {
            "start_url": start_url,
            "parameters_schema": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            "result_schema": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
                "additionalProperties": False,
            },
        }
    }
    monkeypatch.setenv("WEBWRIGHT_BROWSER_PROFILE", str(tmp_path / "profile"))

    async def probe(context):
        return {"url": context.page.url}

    runner = PublishedToolkitRunner(
        toolkit_id="recovery_probe",
        skill_dir=toolkit_dir,
        allowed_domains=["127.0.0.1"],
        tool_specs=tool_specs,
        tool_functions={"probe": probe},
        cdp_url=cdp_url,
        runtime_path=toolkit_dir / "runtime.json",
    )
    runtime = FileRuntimeStore(toolkit_dir / "runtime.json")

    async def scenario() -> tuple[str, str, str]:
        first = await runner.run(tool_id="probe", parameters={})
        assert first["ok"] is True
        first_target = runtime.read()["target_id"]

        await _close_target(cdp_url, first_target)
        second = await runner.run(tool_id="probe", parameters={})
        assert second["ok"] is True
        second_target = runtime.read()["target_id"]

        await _close_browser(cdp_url)
        await asyncio.to_thread(_wait_for_cdp, cdp_url, available=False)
        third = await runner.run(tool_id="probe", parameters={})
        assert third["ok"] is True
        third_target = runtime.read()["target_id"]
        return first_target, second_target, third_target

    try:
        first_target, second_target, third_target = asyncio.run(scenario())
        assert first_target != second_target
        assert second_target != third_target
    finally:
        if is_cdp_available(cdp_url):
            asyncio.run(_close_browser(cdp_url))
            _wait_for_cdp(cdp_url, available=False)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
