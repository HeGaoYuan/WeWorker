from __future__ import annotations

import asyncio
import io
import json
import os
import shutil
import zipfile
from pathlib import Path

import pytest

from webwright.run.tool_debug import run_debug
from webwright.server.debug_store import DebugRunStore
from webwright.server.publisher import ToolkitPublisher
from webwright.server.status import DebugRunStatus
from webwright.server.toolkit_store import ToolkitStore
from webwright.utils.local_cdp import DEFAULT_CDP_URL, page_targets


pytestmark = pytest.mark.skipif(
    os.environ.get("WEBWRIGHT_RUN_TIANJIN_CDP_E2E") != "1",
    reason=(
        "set WEBWRIGHT_RUN_TIANJIN_CDP_E2E=1 to run the real Tianjin "
        "property-certificate print test"
    ),
)


def test_tianjin_fixture_formal_debug_unlocks_current_artifact_export(
    tmp_path: Path,
) -> None:
    start_url = (
        "https://jxd.ghhzrzy.tj.gov.cn/personal/iebdc.html?isKstb"
        "#/newHome/newDashboard"
    )
    prepared = next(
        (
            target
            for target in page_targets(DEFAULT_CDP_URL)
            if target.get("url") == start_url
        ),
        None,
    )
    assert prepared is not None, "the signed-in Tianjin Agent browser tab must be prepared"

    fixture_root = Path(__file__).parents[1] / "fixtures" / "toolkits"
    store_root = tmp_path / "toolkits"
    shutil.copytree(fixture_root, store_root)
    store = ToolkitStore(store_root)
    store.write_runtime(
        "tianjin_property",
        target_id=str(prepared["id"]),
        last_url=start_url,
        last_title=str(prepared.get("title") or ""),
    )
    formal = store.read_formal_slot(
        "tianjin_property", "print_property_certificate"
    )
    assert formal is not None

    debug_store = DebugRunStore(store)
    publisher = ToolkitPublisher(store, debug_store)
    build = publisher.ensure_consistent("tianjin_property")
    assert build is not None
    result = asyncio.run(
        run_debug(
            {
                "toolkit_root": str(store.root),
                "toolkit_id": "tianjin_property",
                "tool_id": "print_property_certificate",
                "channel": "formal",
                "code_hash": formal["code_hash"],
                "artifact_hash": build["artifact_hash"],
                "cdp_url": DEFAULT_CDP_URL,
                "parameters": {},
                "result_path": str(tmp_path / "formal-result.json"),
                "screenshot_path": str(tmp_path / "formal.png"),
            }
        )
    )

    assert result["ok"] is True
    assert result["result"]["status"] == "success"
    assert (tmp_path / "formal.png").is_file()
    formal_run = debug_store.create(
        tool_id="print_property_certificate",
        channel="formal",
        code_hash=formal["code_hash"],
        artifact_hash=build["artifact_hash"],
        parameters={},
    )
    debug_store.update(
        formal_run["debug_run_id"], status=DebugRunStatus.SUCCEEDED.value
    )
    status = publisher.export_status("tianjin_property")
    assert status["artifact_hash"] == build["artifact_hash"]
    assert status["export_eligible"] is True

    archive = zipfile.ZipFile(io.BytesIO(publisher.export_zip("tianjin_property")))
    assert set(archive.namelist()) == {
        "tianjin-property/SKILL.md",
        "tianjin-property/scripts/toolkit.py",
        "tianjin-property/scripts/toolkit_runtime.py",
        "tianjin-property/scripts/requirements.txt",
    }
