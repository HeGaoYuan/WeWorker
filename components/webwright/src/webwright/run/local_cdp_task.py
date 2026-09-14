from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from webwright.run.cli import run_one


def _load_spec(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Task spec must be a JSON object.")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a local CDP Webwright task from a server spec.")
    parser.add_argument("--spec", required=True, type=Path)
    args = parser.parse_args(argv)

    try:
        spec = _load_spec(args.spec)
        mode = spec.get("mode")
        if mode not in {"start", "resume"}:
            raise ValueError(f"Unsupported task mode: {mode!r}")
        result = run_one(
            task=spec.get("instruction") if mode == "start" else None,
            task_id=spec.get("task_id"),
            start_url=spec.get("start_url"),
            target_id=spec.get("target_id"),
            resume_target_id_override=spec.get("resume_target_id"),
            resume_from=Path(spec["resume_from"]) if spec.get("resume_from") else None,
            followup=spec.get("followup"),
            config_spec=list(spec["config_spec"]),
            resolved_output_dir=Path(spec["resolved_output_dir"]),
            snapshot_config=True,
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "error_code": str(getattr(exc, "error_code", "") or ""),
                    "stage": str(getattr(exc, "stage", "") or ""),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 1

    print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
