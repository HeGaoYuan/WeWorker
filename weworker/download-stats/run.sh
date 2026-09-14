#!/bin/bash
# 使用 gunicorn 启动，更稳定

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 激活虚拟环境（如果存在）
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "Virtual environment activated"
fi

# 停止旧进程
pkill -f "gunicorn.*main:app" || true
sleep 1

# 使用 gunicorn 启动（2个worker，自动重启）
nohup gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8766 main:app \
    --access-logfile logs/access.log \
    --error-logfile logs/error.log \
    --log-level info \
    --timeout 120 \
    --worker-tmp-dir /dev/shm \
    > logs/nohup.out 2>&1 &

echo $! > download-stats.pid
echo "Service started with gunicorn (PID: $!)"
echo ""
echo "Logs:"
echo "  - logs/access.log (HTTP requests)"
echo "  - logs/error.log (errors)"
echo "  - logs/nohup.out (output)"
echo ""
sleep 2
ps aux | grep gunicorn | grep main:app
