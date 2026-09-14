import os
from pathlib import Path

_BASE_DIR = Path(__file__).parent
_DEFAULT_DB = _BASE_DIR / "download-stats.db"
DB_PATH = Path(os.environ.get("DOWNLOAD_STATS_DB", str(_DEFAULT_DB)))
DEFAULT_PORT = int(os.environ.get("DOWNLOAD_STATS_PORT", "8766"))
DEFAULT_LOG_DIR = Path(os.environ.get("DOWNLOAD_STATS_LOG_DIR", str(_BASE_DIR / "logs")))
PID_FILE = _BASE_DIR / "download-stats.pid"
