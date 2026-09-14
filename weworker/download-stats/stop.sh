#!/bin/bash
# Download Stats 停止脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f download-stats.pid ]; then
    echo "PID file not found, service may not be running"
    exit 1
fi

PID=$(cat download-stats.pid)
if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID"
    echo "Sent SIGTERM to process $PID"
    sleep 2
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Process still running, forcing with SIGKILL..."
        kill -9 "$PID"
    fi
    rm -f download-stats.pid
    echo "Service stopped"
else
    echo "Process $PID not found"
    rm -f download-stats.pid
fi
