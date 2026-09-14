#!/bin/bash
set -e

echo "=== WeWork macOS 打包 ==="
cd "$(dirname "$0")/.."

# 1. 安装 Node 依赖
echo "[1/5] 安装 Node 依赖..."
npm install
cd renderer && npm install && cd ..

# 2. 构建 React 前端
echo "[2/5] 构建 React 前端..."
cd renderer && npm run build && cd ..

# 3. 打包 Python 后端（PyInstaller）
echo "[3/5] 打包 Python 后端..."
mkdir -p build
cd backend
pip install pyinstaller -q
pyinstaller build.spec \
  --distpath ../build/backend-dist \
  --workpath ../build/backend-work \
  --noconfirm
cd ..

# 4. 打包 Node.js bridge（pkg）
echo "[4/6] 打包 bridge..."
npx @yao-pkg/pkg ../native-host/index.js \
  --target node18-macos-x64 \
  --output build/bridge-dist/wework-bridge-x64
npx @yao-pkg/pkg ../native-host/index.js \
  --target node18-macos-arm64 \
  --output build/bridge-dist/wework-bridge-arm64
# Create universal binary
lipo -create -output build/bridge-dist/wework-bridge \
  build/bridge-dist/wework-bridge-x64 \
  build/bridge-dist/wework-bridge-arm64
chmod +x build/bridge-dist/wework-bridge

# 5. 打包 webcli
echo "[5/6] 打包 webcli..."
node scripts/bundle-webcli.cjs

# 6. electron-builder
echo "[6/6] 打包 Electron 应用..."
npx electron-builder --mac

echo ""
echo "✅ 完成！安装包在 dist-app/ 目录"
ls -lh dist-app/*.dmg 2>/dev/null || true
