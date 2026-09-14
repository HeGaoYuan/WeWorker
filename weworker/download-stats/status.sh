#!/bin/bash
# Download Stats 状态检查脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f download-stats.pid ]; then
    echo "Service is NOT running (no PID file)"
    exit 1
fi

PID=$(cat download-stats.pid)
if ps -p "$PID" > /dev/null 2>&1; then
    echo "Service IS running (PID: $PID)"
    echo ""
    echo "Port: 8766"
    echo "Health: http://localhost:8766/api/downloads/summary"
    echo ""
    echo "Recent logs:"
    tail -10 logs/$(date +%Y-%m-%d).log 2>/dev/null || echo "No logs for today"
    exit 0
else
    echo "Service is NOT running (stale PID file)"
    rm -f download-stats.pid
    exit 1
fi
