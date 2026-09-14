@echo off
echo === WeWork Windows 打包 ===
cd /d "%~dp0\.."

echo [1/5] 安装 Node 依赖...
call npm install
cd renderer && call npm install && cd ..

echo [2/5] 构建 React 前端...
cd renderer && call npm run build && cd ..

echo [3/5] 打包 Python 后端...
if not exist build mkdir build
cd backend
pip install pyinstaller -q
pyinstaller build.spec --distpath ..\build\backend-dist --workpath ..\build\backend-work --noconfirm
cd ..

echo [4/6] 打包 bridge...
if not exist build\bridge-dist mkdir build\bridge-dist
call npx @yao-pkg/pkg ..\native-host\index.js --target node18-win-x64 --output build\bridge-dist\wework-bridge.exe

echo [5/6] 打包 webcli...
call node scripts\bundle-webcli.cjs

echo [6/6] 打包 Electron 应用...
call npx electron-builder --win

echo.
echo 完成！安装包在 dist-app\ 目录
dir dist-app\*.exe 2>nul
