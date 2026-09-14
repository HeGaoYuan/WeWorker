#!/usr/bin/env node
/**
 * Native Host 安装脚本（遗留，用于 Chrome Native Messaging 注册）
 *
 * 用法：node webcli/install.js [--extension-id EXTENSION_ID]
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Native Host 名称（必须与 extension 中调用的名称一致）
const HOST_NAME = "com.webmcp.adapter";

// 从命令行参数获取扩展 ID（加载未打包扩展时 Chrome 会分配一个 ID）
const args = process.argv.slice(2);
const extIdIndex = args.indexOf("--extension-id");
const EXTENSION_ID = extIdIndex !== -1 ? args[extIdIndex + 1] : null;

if (!EXTENSION_ID) {
  console.log("Usage: node webcli/install.js --extension-id <YOUR_EXTENSION_ID>");
  console.log("");
  console.log("To find your extension ID:");
  console.log("  1. Open Chrome -> chrome://extensions");
  console.log("  2. Enable 'Developer mode'");
  console.log("  3. Click 'Load unpacked' and select the 'extension/' folder");
  console.log("  4. Copy the ID shown under the extension name");
  process.exit(1);
}

// native host 可执行文件路径（node 脚本包装）
const hostScriptPath = resolve(__dirname, "index.js");

// native messaging manifest 内容
const manifest = {
  name: HOST_NAME,
  description: "WebMCP Adapter Native Host - bridges Chrome extension and MCP clients",
  path: hostScriptPath,
  type: "stdio",
  allowed_origins: [
    `chrome-extension://${EXTENSION_ID}/`,
  ],
};

// ─── 平台相关安装逻辑 ─────────────────────────────────────────────────────────

function install() {
  const platform = os.platform();
  const manifestJson = JSON.stringify(manifest, null, 2);

  if (platform === "darwin") {
    // macOS
    const dir = `${os.homedir()}/Library/Application Support/Google/Chrome/NativeMessagingHosts`;
    mkdirSync(dir, { recursive: true });
    const manifestPath = `${dir}/${HOST_NAME}.json`;
    writeFileSync(manifestPath, manifestJson);
    // 确保 index.js 可执行
    execSync(`chmod +x "${hostScriptPath}"`);
    console.log(`✅ Installed native host manifest: ${manifestPath}`);

  } else if (platform === "linux") {
    // Linux
    const dir = `${os.homedir()}/.config/google-chrome/NativeMessagingHosts`;
    mkdirSync(dir, { recursive: true });
    const manifestPath = `${dir}/${HOST_NAME}.json`;
    writeFileSync(manifestPath, manifestJson);
    execSync(`chmod +x "${hostScriptPath}"`);
    console.log(`✅ Installed native host manifest: ${manifestPath}`);

  } else if (platform === "win32") {
    // Windows: 写注册表
    const manifestPath = resolve(projectRoot, `${HOST_NAME}.json`);
    writeFileSync(manifestPath, manifestJson);

    const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
    execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath}" /f`);
    console.log(`✅ Installed native host manifest: ${manifestPath}`);
    console.log(`✅ Registered in Windows Registry: ${regKey}`);

  } else {
    console.error(`❌ Unsupported platform: ${platform}`);
    process.exit(1);
  }
}

// 确保 index.js 开头有 shebang，Windows 上用 node 包装脚本
function ensureExecutable() {
  if (os.platform() !== "win32") return;

  // 在 Windows 上创建一个 .bat 包装器
  const batPath = resolve(__dirname, "webmcp-host.bat");
  const nodeExe = process.execPath;
  writeFileSync(batPath, `@echo off\n"${nodeExe}" "${hostScriptPath}" %*\n`);

  // 更新 manifest 的 path 指向 .bat
  manifest.path = batPath;
  console.log(`Created Windows wrapper: ${batPath}`);
}

ensureExecutable();
install();

console.log("");
console.log("Next steps:");
console.log("  1. npm install  (install dependencies)");
console.log(`  2. Configure Claude Desktop to use this MCP server:`);
console.log(`     Add to ~/Library/Application Support/Claude/claude_desktop_config.json:`);
console.log(`     {`);
console.log(`       "mcpServers": {`);
console.log(`         "webmcp-adapter": {`);
console.log(`           "command": "node",`);
console.log(`           "args": ["${hostScriptPath}"]`);
console.log(`         }`);
console.log(`       }`);
console.log(`     }`);
