from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from webwright.server.records import atomic_write_json, make_run_id, now_iso
from webwright.server.status import DevelopmentRunStatus
from webwright.server.toolkit_store import ToolkitStore


class DevelopmentRunStore:
    def __init__(self, toolkit_store: ToolkitStore):
        self.toolkit_store = toolkit_store

    def root(self, toolkit_id: str) -> Path:
        return self.toolkit_store.toolkit_dir(toolkit_id) / ".server" / "development_runs"

    def run_dir(self, toolkit_id: str, development_run_id: str) -> Path:
        if not development_run_id.startswith("development_") or any(
            character
            not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
            for character in development_run_id
        ):
            raise ValueError(f"Invalid development_run_id: {development_run_id}")
        root = self.root(toolkit_id).resolve()
        path = (root / development_run_id).resolve()
        if root not in path.parents:
            raise ValueError(f"Invalid development_run_id: {development_run_id}")
        return path

    def create(
        self,
        *,
        toolkit_id: str,
        tool_id: str,
        instruction: str,
        exploration_only: bool = False,
    ) -> dict[str, Any]:
        self.toolkit_store.get_tool(toolkit_id, tool_id)
        run_id = make_run_id().replace("run_", "development_", 1)
        payload = {
            "development_run_id": run_id,
            "toolkit_id": toolkit_id,
            "tool_id": tool_id,
            "instruction": instruction,
            "exploration_only": bool(exploration_only),
            "status": DevelopmentRunStatus.QUEUED.value,
            "error": "",
            "error_code": "",
            "error_stage": "",
            "created_at": now_iso(),
            "started_at": "",
            "finished_at": "",
        }
        atomic_write_json(self.run_dir(toolkit_id, run_id) / "run.json", payload)
        return payload

    def read(self, development_run_id: str) -> dict[str, Any]:
        if not development_run_id.startswith("development_") or any(
            character
            not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
            for character in development_run_id
        ):
            raise ValueError(f"Invalid development_run_id: {development_run_id}")
        for path in self.toolkit_store.root.glob(
            f"*/.server/development_runs/{development_run_id}/run.json"
        ):
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                return payload
        raise FileNotFoundError(f"Development Run not found: {development_run_id}")

    def update(self, development_run_id: str, **updates: Any) -> dict[str, Any]:
        payload = self.read(development_run_id)
        if "status" in updates and updates["status"] not in {
            status.value for status in DevelopmentRunStatus
        }:
            raise ValueError(f"Invalid Development Run status: {updates['status']}")
        payload.update(updates)
        atomic_write_json(
            self.run_dir(str(payload["toolkit_id"]), development_run_id) / "run.json",
            payload,
        )
        return payload

    def list_for_tool(self, toolkit_id: str, tool_id: str) -> list[dict[str, Any]]:
        items = []
        for path in self.root(toolkit_id).glob("*/run.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if payload.get("tool_id") == tool_id:
                items.append(payload)
        return sorted(items, key=lambda item: str(item.get("created_at") or ""), reverse=True)

    def recover_incomplete(self) -> int:
        recovered = 0
        for path in self.toolkit_store.root.glob(
            "*/.server/development_runs/*/run.json"
        ):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if payload.get("status") not in {"queued", "running"}:
                continue
            self.update(
                str(payload["development_run_id"]),
                status=DevelopmentRunStatus.FAILED.value,
                error="Server restarted before Development Run completed.",
                error_code="server_restarted",
                error_stage="lifecycle",
                finished_at=now_iso(),
            )
            recovered += 1
        return recovered
