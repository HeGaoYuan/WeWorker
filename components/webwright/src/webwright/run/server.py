from __future__ import annotations

import os
import signal
import threading

import typer
from werkzeug.serving import make_server

from webwright.paths import WebwrightPaths
from webwright.run.server_lifecycle import (
    ParentProcessWatchdog,
    ServerLifecycle,
    StdinCloseWatchdog,
)
from webwright.runtime_identity import RuntimeIdentity
from webwright.server.app import create_app
from webwright.server.browser import DEFAULT_CDP_URL


app = typer.Typer(no_args_is_help=False)


@app.command()
def main(
    host: str = typer.Option("127.0.0.1", "--host", help="HTTP bind host."),
    port: int = typer.Option(8765, "--port", help="HTTP bind port."),
    cdp_url: str = typer.Option(DEFAULT_CDP_URL, "--cdp-url", help="Local Chrome/Edge CDP endpoint."),
    parent_pid: int = typer.Option(
        0,
        "--parent-pid",
        min=0,
        help="Exit when this parent process no longer exists; 0 disables the watchdog.",
    ),
    exit_on_stdin_close: bool = typer.Option(
        False,
        "--exit-on-stdin-close",
        help="Exit cleanly when the parent closes stdin.",
    ),
) -> None:
    if host not in {"127.0.0.1", "localhost"}:
        raise typer.BadParameter("--host must be 127.0.0.1 or localhost.")
    if parent_pid == os.getpid():
        raise typer.BadParameter("--parent-pid cannot be the Webwright process itself.")
    paths = WebwrightPaths.resolve().ensure()
    identity = RuntimeIdentity.resolve()
    flask_app = create_app(
        paths=paths,
        cdp_url=cdp_url,
        runtime_identity=identity.as_health_fields(),
        bind_host=host,
        bind_port=port,
    )
    process_manager = flask_app.config["WEBWRIGHT_PROCESS_MANAGER"]
    server = make_server(host, port, flask_app, threaded=True)
    lifecycle = ServerLifecycle(server=server, process_manager=process_manager)
    watchdog = (
        ParentProcessWatchdog(parent_pid=parent_pid, on_parent_exit=lifecycle.stop)
        if parent_pid
        else None
    )
    stdin_watchdog = (
        StdinCloseWatchdog(on_stdin_close=lifecycle.stop)
        if exit_on_stdin_close
        else None
    )
    previous_handlers = {}

    def request_stop(_signum, _frame) -> None:
        threading.Thread(
            target=lifecycle.stop,
            name="webwright-signal-shutdown",
            daemon=True,
        ).start()

    for signum in (signal.SIGINT, signal.SIGTERM):
        previous_handlers[signum] = signal.getsignal(signum)
        signal.signal(signum, request_stop)
    if watchdog is not None:
        watchdog.start()
    if stdin_watchdog is not None:
        stdin_watchdog.start()
    try:
        server.serve_forever()
    finally:
        if stdin_watchdog is not None:
            stdin_watchdog.stop()
        if watchdog is not None:
            watchdog.stop()
        lifecycle.close()
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


if __name__ == "__main__":
    app()
