from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


def append_runtime_log(path: Path | None, *, source: str, event: str, **data: Any) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "event": event,
        **data,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True))
        handle.write("\n")


def append_process_log(path: Path | None, *, source: str, event: str, **data: Any) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = " ".join(
        f"{key}={json.dumps(value, ensure_ascii=True, separators=(',', ':'))}"
        for key, value in data.items()
        if value is not None and value != ""
    )
    line = f"{datetime.now(timezone.utc).isoformat()} [{source}] {event}"
    if fields:
        line = f"{line} {fields}"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def log_run_error(
    process_log_path: Path | None,
    runtime_error_path: Path | None,
    *,
    source: str,
    event: str,
    error_code: str,
    stage: str,
    error_type: str,
    **data: Any,
) -> None:
    fields = {
        "error_code": error_code,
        "stage": stage,
        "error_type": error_type,
        **data,
    }
    append_process_log(process_log_path, source=source, event=event, **fields)
    append_runtime_log(runtime_error_path, source=source, event=event, **fields)
