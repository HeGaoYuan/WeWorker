from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from webwright.tool_runtime.browser import ToolkitBrowserSession
from webwright.tool_runtime.toolkit_runtime import (
    DEFAULT_CDP_URL,
    PublishedToolkitRunner,
    error_output,
    execute_tool,
)


class ToolRunner:
    def __init__(
        self,
        *,
        store: Any,
        cdp_url: str = DEFAULT_CDP_URL,
        session_factory: Callable[..., ToolkitBrowserSession] = ToolkitBrowserSession,
    ):
        self.store = store
        self.cdp_url = cdp_url
        self.session_factory = session_factory

    async def run(
        self,
        *,
        toolkit_id: str,
        tool_id: str,
        channel: str,
        parameters: dict[str, Any],
        screenshot_path: Path | None = None,
    ) -> dict[str, Any]:
        if channel not in {"formal", "development"}:
            return error_output(
                tool_id=tool_id,
                code="invalid_channel",
                message="channel must be formal or development.",
                page={"url": "", "title": ""},
            )
        tool = self.store.get_tool(toolkit_id, tool_id)
        slot = (
            self.store.read_formal_slot(toolkit_id, tool_id)
            if channel == "formal"
            else self.store.read_development_slot(toolkit_id, tool_id)
        )
        if slot is None:
            return error_output(
                tool_id=tool_id,
                code="version_not_found",
                message=f"Tool has no {channel} version.",
                page={"url": "", "title": ""},
            )

        session = self.session_factory(
            store=self.store,
            toolkit_id=toolkit_id,
            cdp_url=self.cdp_url,
        )

        def load_function() -> Callable[..., Any]:
            namespace: dict[str, Any] = {}
            exec(compile(slot["code"], f"<{tool_id}>", "exec"), namespace)
            return namespace.get(tool_id)

        return await execute_tool(
            tool_id=tool_id,
            tool=tool,
            parameters_schema=slot["parameters_schema"],
            result_schema=slot["result_schema"],
            parameters=parameters,
            load_function=load_function,
            session=session,
            screenshot_path=screenshot_path,
        )
