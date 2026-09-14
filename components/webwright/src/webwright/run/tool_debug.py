from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from webwright.server.records import atomic_write_json
from webwright.server.toolkit_store import ToolkitStore
from webwright.runtime_launcher import RuntimeLauncher
from webwright.tool_runtime.runner import ToolRunner
from webwright.tool_runtime.state import FileRuntimeStore


def _load_spec(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Debug spec must be a JSON object.")
    return payload


async def run_debug(spec: dict[str, Any]) -> dict[str, Any]:
    toolkit_id = str(spec["toolkit_id"])
    toolkit_root = Path(spec["toolkit_root"])
    toolkit_dir = toolkit_root / toolkit_id
    if spec["channel"] == "formal":
        runtime_store = FileRuntimeStore(toolkit_dir / "runtime.json")
        before_runtime = runtime_store.read()
        skill_scripts_dir = toolkit_dir / toolkit_id.replace("_", "-") / "scripts"
        output = await _run_formal_cli(spec, skill_scripts_dir, toolkit_dir / "runtime.json")
    else:
        store = ToolkitStore(toolkit_root)
        before_runtime = store.read_runtime(toolkit_id)
        output = await ToolRunner(store=store, cdp_url=str(spec["cdp_url"])).run(
            toolkit_id=toolkit_id,
            tool_id=str(spec["tool_id"]),
            channel="development",
            parameters=spec.get("parameters") or {},
            screenshot_path=Path(spec["screenshot_path"]),
        )
    before_page = {
        "url": str(before_runtime.get("last_url") or ""),
        "title": str(before_runtime.get("last_title") or ""),
    }
    result = {
        "ok": bool(output.get("ok")),
        "result": output.get("data") if output.get("ok") else {},
        "error": "" if output.get("ok") else str((output.get("error") or {}).get("message") or "Tool failed."),
        "before_page": before_page,
        "after_page": output.get("page") or {"url": "", "title": ""},
    }
    atomic_write_json(Path(spec["result_path"]), result)
    return result


async def _run_formal_cli(
    spec: dict[str, Any], toolkit_dir: Path, runtime_path: Path
) -> dict[str, Any]:
    parameters = spec.get("parameters") or {}
    launcher = RuntimeLauncher()
    command = launcher.script_command(
        toolkit_dir / "toolkit.py",
        [str(spec["tool_id"]).replace("_", "-")],
    )
    env = launcher.internal_worker_environment({
        "PYTHONIOENCODING": "utf-8",
        "WEBWRIGHT_CDP_URL": str(spec["cdp_url"]),
        "WEBWRIGHT_PARAMETERS_STDIN": "1",
        "WEBWRIGHT_SCREENSHOT_PATH": str(spec["screenshot_path"]),
        "WEBWRIGHT_RUNTIME_PATH": str(runtime_path),
    })
    process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(Path(spec["result_path"]).resolve().parent),
    )
    stdout, stderr = await process.communicate(
        json.dumps(parameters, ensure_ascii=False).encode("utf-8")
    )
    if stderr:
        print(stderr.decode("utf-8", errors="replace"), end="", file=sys.stderr)
    lines = [line for line in stdout.decode("utf-8").splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f"Published CLI exited with code {process.returncode} without JSON output.")
    output = json.loads(lines[-1])
    if not isinstance(output, dict):
        raise ValueError("Published CLI output must be a JSON object.")
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one Toolkit Tool Debug Run.")
    parser.add_argument("--spec", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        result = asyncio.run(run_debug(_load_spec(args.spec)))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
