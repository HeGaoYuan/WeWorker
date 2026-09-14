from __future__ import annotations

from typing import Any, Callable

from webwright.tool_runtime.state import RuntimeStore, ToolkitStoreRuntimeAdapter
from webwright.tool_runtime.toolkit_runtime import (
    DEFAULT_CDP_URL,
    ToolkitBrowserSession as PublishedToolkitBrowserSession,
)


class ToolkitBrowserSession(PublishedToolkitBrowserSession):
    def __init__(
        self,
        *,
        runtime_store: RuntimeStore | None = None,
        allowed_domains: list[str] | set[str] | tuple[str, ...] | None = None,
        store: Any | None = None,
        toolkit_id: str = "",
        cdp_url: str = DEFAULT_CDP_URL,
        playwright_factory: Callable[[], Any] | None = None,
        browser_launcher: Callable[[str], Any] | None = None,
    ):
        if runtime_store is None:
            if store is None or not toolkit_id:
                raise ValueError("runtime_store and allowed_domains are required.")
            runtime_store = ToolkitStoreRuntimeAdapter(store, toolkit_id)
        if allowed_domains is None:
            if store is None or not toolkit_id:
                raise ValueError("runtime_store and allowed_domains are required.")
            allowed_domains = store.get_toolkit(toolkit_id)["allowed_domains"]
        super().__init__(
            runtime_store=runtime_store,
            allowed_domains=allowed_domains,
            cdp_url=cdp_url,
            playwright_factory=playwright_factory,
            browser_launcher=browser_launcher,
        )
