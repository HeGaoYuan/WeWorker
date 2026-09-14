import logging
import os
import signal
import sys
from datetime import datetime, timezone
from typing import Optional

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import DEFAULT_PORT, DEFAULT_LOG_DIR, PID_FILE
from models import DownloadRequest, DownloadResponse, SummaryResponse
from store import store


def setup_logging():
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = DEFAULT_LOG_DIR / f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.log"

    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(formatter)

    # File handler
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    return logging.getLogger(__name__)


logger = setup_logging()

app = FastAPI(title="WeWorker Download Stats")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"--> {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"<-- {request.method} {request.url.path} {response.status_code}")
    return response


@app.on_event("startup")
async def startup():
    await store.init()
    logger.info("Download stats service started")


@app.on_event("shutdown")
async def shutdown():
    logger.info("Download stats service stopping...")
    if PID_FILE.exists():
        PID_FILE.unlink()


# ── Record download ──────────────────────────────────────────────────────────

@app.post("/api/downloads", response_model=DownloadResponse)
async def record_download(body: DownloadRequest):
    logger.info(f"Record download: version={body.version}, platform={body.platform}")
    result = await store.record_download(body.version, body.platform)
    logger.info(f"Download recorded: version={body.version}, platform={body.platform}, count={result['count']}")
    return result


# ── Query summary ────────────────────────────────────────────────────────────

@app.get("/api/downloads/summary", response_model=SummaryResponse)
async def get_summary(platform: Optional[str] = None):
    logger.info(f"Query summary: platform={platform or 'all'}")
    result = await store.get_summary(platform)
    logger.info(f"Summary result: {len(result['platforms'])} platforms, grand_total={result['grand_total']}")
    return result


def _write_pid():
    PID_FILE.write_text(str(os.getpid()))
    logger.info(f"PID file written: {PID_FILE} (pid={os.getpid()})")


def _is_running() -> bool:
    if not PID_FILE.exists():
        return False
    pid = int(PID_FILE.read_text().strip())
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        PID_FILE.unlink()
        return False


def run_server():
    port = int(os.environ.get("DOWNLOAD_STATS_PORT", str(DEFAULT_PORT)))
    _write_pid()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


def stop_server():
    if not PID_FILE.exists():
        print("PID file not found, service may not be running")
        return
    pid = int(PID_FILE.read_text().strip())
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Sent SIGTERM to process {pid}")
    except ProcessLookupError:
        print(f"Process {pid} not found")
        PID_FILE.unlink()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "stop":
            stop_server()
        elif cmd == "status":
            if _is_running():
                pid = PID_FILE.read_text().strip()
                print(f"Service is running (pid={pid})")
            else:
                print("Service is not running")
        else:
            print(f"Usage: python main.py [stop|status]")
            print(f"  (no args)  - start service in foreground")
            print(f"  stop       - stop background service")
            print(f"  status     - check if service is running")
    else:
        run_server()
