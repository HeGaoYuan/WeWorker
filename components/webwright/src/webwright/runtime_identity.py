from __future__ import annotations

import json
import platform
import sys
from dataclasses import dataclass
from pathlib import Path

from webwright import __version__


def _architecture() -> str:
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        return "arm64"
    if machine in {"amd64", "x86_64"}:
        return "x64"
    return machine


@dataclass(frozen=True)
class RuntimeIdentity:
    version: str
    platform: str
    arch: str
    mode: str

    @classmethod
    def resolve(
        cls,
        *,
        executable: Path | str | None = None,
        frozen: bool | None = None,
    ) -> "RuntimeIdentity":
        is_frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
        executable_path = Path(executable or sys.executable).expanduser().resolve()
        manifest_path = executable_path.parent / "webwright-runtime.json"
        if is_frozen and manifest_path.is_file():
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Webwright runtime manifest must be a JSON object.")
            return cls(
                version=str(payload.get("webwright_version") or ""),
                platform=str(payload.get("platform") or ""),
                arch=str(payload.get("arch") or ""),
                mode=str(payload.get("mode") or ""),
            )
        return cls(
            version=__version__,
            platform=sys.platform,
            arch=_architecture(),
            mode="standalone" if is_frozen else "source",
        )

    def as_health_fields(self) -> dict[str, str]:
        return {
            "version": self.version,
            "platform": self.platform,
            "arch": self.arch,
            "mode": self.mode,
        }


__all__ = ["RuntimeIdentity"]
