from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class WebwrightPaths:
    home: Path
    env_file: Path
    tasks: Path
    toolkits: Path
    browser_profile: Path
    toolkit_state: Path
    logs: Path

    @classmethod
    def resolve(
        cls,
        *,
        environ: Mapping[str, str] | None = None,
        home: Path | str | None = None,
    ) -> "WebwrightPaths":
        environment = os.environ if environ is None else environ
        configured = home if home is not None else environment.get("WEBWRIGHT_HOME")
        if configured is not None:
            configured_path = Path(configured).expanduser()
            if not configured_path.is_absolute():
                raise ValueError("WEBWRIGHT_HOME must be an absolute path.")
            resolved_home = configured_path.resolve()
        else:
            resolved_home = (Path.home() / ".weworker" / "webwright").resolve()
        return cls(
            home=resolved_home,
            env_file=resolved_home / ".env",
            tasks=resolved_home / "tasks",
            toolkits=resolved_home / "toolkits",
            browser_profile=resolved_home / "browser" / "profile",
            toolkit_state=resolved_home / "toolkit-state",
            logs=resolved_home / "logs",
        )

    def ensure(self) -> "WebwrightPaths":
        for path in (
            self.home,
            self.tasks,
            self.toolkits,
            self.browser_profile,
            self.toolkit_state,
            self.logs,
        ):
            path.mkdir(parents=True, exist_ok=True)
            if os.name != "nt":
                path.chmod(stat.S_IRWXU)
        if self.env_file.exists() and os.name != "nt":
            self.env_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
        return self


__all__ = ["WebwrightPaths"]
