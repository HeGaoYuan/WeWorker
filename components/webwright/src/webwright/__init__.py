from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from webwright.paths import WebwrightPaths

try:
    import dotenv
except ModuleNotFoundError:
    class _DotenvShim:
        @staticmethod
        def load_dotenv(*args, **kwargs):
            return False
    dotenv = _DotenvShim()
__version__ = "0.1.0"

package_dir = Path(__file__).resolve().parent
_default_paths = WebwrightPaths.resolve()
global_config_dir = _default_paths.home
global_config_file = _default_paths.env_file
dotenv.load_dotenv(dotenv_path=global_config_file)


class Model(Protocol):
    config: Any

    def __call__(self, messages: list[dict[str, Any]], **kwargs) -> str: ...

    def query(self, messages: list[dict[str, Any]], **kwargs) -> dict[str, Any]: ...

    def format_message(self, **kwargs) -> dict[str, Any]: ...

    def format_observation_messages(
        self,
        message: dict[str, Any],
        outputs: list[dict[str, Any]],
        template_vars: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]: ...

    def get_template_vars(self, **kwargs) -> dict[str, Any]: ...

    def serialize(self) -> dict[str, Any]: ...


class Environment(Protocol):
    config: Any

    def prepare(self, **kwargs) -> None: ...

    def execute(self, action: dict[str, Any], cwd: str = "") -> dict[str, Any]: ...

    def get_template_vars(self, **kwargs) -> dict[str, Any]: ...

    def serialize(self) -> dict[str, Any]: ...

    def close(self) -> None: ...


class Agent(Protocol):
    config: Any

    def run(self, task: str, **kwargs) -> dict[str, Any]: ...

    def save(self, path: Path | None, *extra_dicts) -> dict[str, Any]: ...


__all__ = [
    "Agent",
    "Environment",
    "Model",
    "__version__",
    "global_config_dir",
    "global_config_file",
    "package_dir",
]
