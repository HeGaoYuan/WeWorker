# Download Stats - Linux 后台运行指南

## 问题说明
直接用 uvicorn 运行在收到畸形 HTTP 请求时会崩溃，需要用 gunicorn 或 supervisor 保证稳定。

---

## 方式一：使用 supervisor（推荐，自动重启）

### 1. 安装 supervisor
```bash
sudo apt install supervisor  # Debian/Ubuntu
# 或
sudo yum install supervisor  # CentOS/RHEL
```

### 2. 配置
编辑 `download-stats.conf`，替换路径和用户名，然后：
```bash
sudo cp download-stats.conf /etc/supervisor/conf.d/
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start download-stats
```

### 3. 管理命令
```bash
sudo supervisorctl status download-stats
sudo supervisorctl stop download-stats
sudo supervisorctl restart download-stats
sudo supervisorctl tail -f download-stats
```

---

## 方式二：使用 gunicorn（简单）

### 安装依赖
```bash
pip install -r requirements.txt
```

### 启动
```bash
chmod +x run.sh
./run.sh
```

### 停止
```bash
pkill -f "gunicorn.*main:app"
rm -f download-stats.pid
```

### 查看状态
```bash
ps aux | grep gunicorn
```

---

## 日志
- `logs/access.log` - HTTP 请求日志
- `logs/error.log` - 错误日志
- `logs/nohup.out` - 输出日志
- `logs/YYYY-MM-DD.log` - 应用日志
