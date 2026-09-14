#!/bin/bash
# Download Stats 启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 激活虚拟环境（如果存在）
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "Virtual environment activated"
fi

# 检查是否已经在运行
if [ -f download-stats.pid ]; then
    PID=$(cat download-stats.pid)
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Service is already running (PID: $PID)"
        exit 1
    else
        echo "Removing stale PID file"
        rm -f download-stats.pid
    fi
fi

# 使用 nohup 在后台启动
nohup python3 main.py > logs/nohup.out 2>&1 &
echo $! > download-stats.pid
echo "Service started in background (PID: $!)"
echo "Logs: $SCRIPT_DIR/logs/nohup.out"
