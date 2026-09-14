"""Persistent store for server-mode model configurations.

Users can save several model configs (provider + optional base_url + api_key +
optional model_name), and mark one active. The active config is applied
globally to every new/continued task. Persisted as plaintext JSON on the local
disk under ``outputs/`` (already gitignored); the api_key never leaves this
file except as an environment variable injected into the task subprocess.
"""

from __future__ import annotations

import json
import os
import stat
from datetime import datetime
from pathlib import Path
from typing import Any

from webwright.server.model_providers import get_provider
from webwright.server.records import atomic_write_json, now_iso

_EDITABLE_FIELDS = ("label", "provider", "model_name", "base_url", "api_key")


class ModelConfigStore:
    def __init__(self, path: Path | str):
        self.path = Path(path).expanduser().resolve()

    # ---- persistence ---------------------------------------------------------

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"active_id": "", "models": []}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"active_id": "", "models": []}
        data.setdefault("active_id", "")
        models = data.get("models")
        data["models"] = models if isinstance(models, list) else []
        return data

    def _write(self, data: dict[str, Any]) -> None:
        atomic_write_json(self.path, data)
        if os.name != "nt":
            self.path.chmod(stat.S_IRUSR | stat.S_IWUSR)

    @staticmethod
    def _new_id() -> str:
        return f"m_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

    # ---- reads ---------------------------------------------------------------

    def list_models(self) -> list[dict[str, Any]]:
        return self._read()["models"]

    def get(self, model_id: str) -> dict[str, Any]:
        for model in self._read()["models"]:
            if model.get("id") == model_id:
                return model
        raise KeyError(f"Model config not found: {model_id}")

    def active_id(self) -> str:
        return self._read().get("active_id", "")

    def get_active(self) -> dict[str, Any] | None:
        data = self._read()
        active_id = data.get("active_id", "")
        if not active_id:
            return None
        for model in data["models"]:
            if model.get("id") == active_id:
                return model
        return None

    # ---- writes --------------------------------------------------------------

    def create(self, **fields: Any) -> dict[str, Any]:
        provider = str(fields.get("provider") or "").strip()
        get_provider(provider)  # validate; raises ValueError for unknown provider
        data = self._read()
        now = now_iso()
        model = {
            "id": self._new_id(),
            "label": str(fields.get("label") or "").strip(),
            "provider": provider,
            "model_name": str(fields.get("model_name") or "").strip(),
            "base_url": str(fields.get("base_url") or "").strip(),
            "api_key": str(fields.get("api_key") or "").strip(),
            "created_at": now,
            "updated_at": now,
        }
        data["models"].append(model)
        if not data.get("active_id"):
            data["active_id"] = model["id"]
        self._write(data)
        return model

    def update(self, model_id: str, **fields: Any) -> dict[str, Any]:
        data = self._read()
        for model in data["models"]:
            if model.get("id") != model_id:
                continue
            if "provider" in fields and fields["provider"] is not None:
                provider = str(fields["provider"]).strip()
                get_provider(provider)  # validate
                model["provider"] = provider
            for key in ("label", "model_name", "base_url"):
                if fields.get(key) is not None:
                    model[key] = str(fields[key]).strip()
            # api_key: only overwrite when a non-empty value is supplied.
            api_key = fields.get("api_key")
            if api_key:
                model["api_key"] = str(api_key).strip()
            model["updated_at"] = now_iso()
            self._write(data)
            return model
        raise KeyError(f"Model config not found: {model_id}")

    def delete(self, model_id: str) -> None:
        data = self._read()
        remaining = [m for m in data["models"] if m.get("id") != model_id]
        if len(remaining) == len(data["models"]):
            raise KeyError(f"Model config not found: {model_id}")
        data["models"] = remaining
        if data.get("active_id") == model_id:
            data["active_id"] = ""
        self._write(data)

    def set_active(self, model_id: str) -> dict[str, Any]:
        data = self._read()
        if not any(m.get("id") == model_id for m in data["models"]):
            raise KeyError(f"Model config not found: {model_id}")
        data["active_id"] = model_id
        self._write(data)
        return data
