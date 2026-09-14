'use strict';

/**
 * prepare-build.cjs — 构建预处理脚本
 *
 * 职责：
 * 1. 读取并校验 weworker/build-profile.json
 * 2. 从各 adapter 的 manifest.json 筛选 adapter，输出到 build/adapters-dist/
 * 3. 将 providers/defaultProvider 写入 build/.build-defines.json
 *
 * 用法：node scripts/prepare-build.cjs（从 weworker/ 目录运行）
 */

const fs = require('fs');
const path = require('path');
const { validateBuildProfile } = require('./build-profile-validator.cjs');
const {
  DEFAULT_ICON,
  buildRegistryFromManifests,
  loadManifestById,
} = require('./adapter-registry-sync.cjs');

const WEWORKER_ROOT = path.resolve(__dirname, '..');
const PROFILE_PATH = path.resolve(WEWORKER_ROOT, 'build-profile.json');
const ADAPTERS_SRC_DIR = path.resolve(__dirname, '../../extension/adapters');
const ADAPTERS_DIST_DIR = path.resolve(WEWORKER_ROOT, 'build/adapters-dist');
const BUILD_DEFINES_PATH = path.resolve(WEWORKER_ROOT, 'build/.build-defines.json');

/** 递归复制文件/目录（Windows 上对子目录用 copyFileSync 会 EPERM） */
function copyTreeSync(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyTreeSync(path.resolve(src, name), path.resolve(dest, name));
    }
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// ── Task 2.1: 读取并校验 build-profile.json ──

let rawJson;
try {
  rawJson = fs.readFileSync(PROFILE_PATH, 'utf-8');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      `[prepare-build] ERROR: build-profile.json not found at ${PROFILE_PATH}\n` +
      `  Please create the file. See the default template in the repository.`
    );
  } else {
    console.error(`[prepare-build] ERROR: Failed to read build-profile.json: ${err.message}`);
  }
  process.exit(1);
}

let profile;
try {
  profile = JSON.parse(rawJson);
} catch (err) {
  console.error(
    `[prepare-build] ERROR: build-profile.json contains invalid JSON.\n` +
    `  ${err.message}`
  );
  process.exit(1);
}

try {
  validateBuildProfile(profile);
} catch (err) {
  console.error(`[prepare-build] ERROR: ${err.message}`);
  process.exit(1);
}

console.log('[prepare-build] build-profile.json validated successfully.');

// ── Task 2.2: Adapter 筛选逻辑（manifest.json 为唯一数据源） ──

const manifestById = loadManifestById(ADAPTERS_SRC_DIR);
const requestedIds = profile.adapters;
const filteredAdapters = [];
const skippedIds = [];

for (const id of requestedIds) {
  const record = manifestById.get(id);
  if (record) {
    filteredAdapters.push(record.manifest);
  } else {
    skippedIds.push(id);
    console.warn(`[prepare-build] WARNING: adapter "${id}" manifest not found, skipping.`);
  }
}

// 确保输出目录存在
fs.mkdirSync(ADAPTERS_DIST_DIR, { recursive: true });

const filteredRegistry = buildRegistryFromManifests(filteredAdapters, { defaultIcon: DEFAULT_ICON, preserveOrder: true });
fs.writeFileSync(
  path.resolve(ADAPTERS_DIST_DIR, 'registry.json'),
  JSON.stringify(filteredRegistry, null, 2) + '\n',
  'utf-8'
);

// 复制对应的 adapter 目录（含 webcli-generated 等子目录）
for (const entry of filteredAdapters) {
  const srcDir = path.resolve(ADAPTERS_SRC_DIR, entry.id);
  const destDir = path.resolve(ADAPTERS_DIST_DIR, entry.id);
  if (fs.existsSync(srcDir)) {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    copyTreeSync(srcDir, destDir);
  } else {
    console.warn(`[prepare-build] WARNING: adapter directory not found: ${srcDir}`);
  }
}

console.log(
  `[prepare-build] Adapter filtering complete: ${filteredAdapters.length} adapter(s) copied` +
  (skippedIds.length > 0 ? `, ${skippedIds.length} skipped` : '') +
  '.'
);

// 生成 adapters/index.json：扩展启动时据此初始化已安装 adapter ID 列表。
// 缺失该文件会导致扩展无法发现任何 adapter（static direct 路由也不加载），
// 所有工具退化到 page 路由。此前打包产物一直缺此文件。
const adapterIds = filteredAdapters.map((entry) => entry.id).sort();
fs.writeFileSync(
  path.resolve(ADAPTERS_DIST_DIR, 'index.json'),
  JSON.stringify(adapterIds, null, 2) + '\n',
  'utf-8'
);

// ── Task 2.3: 生成 .build-defines.json ──

const buildDefines = {
  providers: profile.providers,
  defaultProvider: profile.defaultProvider,
  commitHash: (() => {
    try {
      return require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch { return 'unknown'; }
  })(),
};

fs.mkdirSync(path.dirname(BUILD_DEFINES_PATH), { recursive: true });
fs.writeFileSync(
  BUILD_DEFINES_PATH,
  JSON.stringify(buildDefines, null, 2) + '\n',
  'utf-8'
);

console.log(`[prepare-build] .build-defines.json written to ${BUILD_DEFINES_PATH}`);

// ── Task 2.4: 同步 extension/manifest.json 版本号 ──

const MANIFEST_PATH = path.resolve(__dirname, '../../extension/manifest.json');
const WEWORKER_PKG_PATH = path.resolve(WEWORKER_ROOT, 'package.json');
const weworkerPkg = JSON.parse(fs.readFileSync(WEWORKER_PKG_PATH, 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

if (manifest.version !== weworkerPkg.version) {
  manifest.version = weworkerPkg.version;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`[prepare-build] extension/manifest.json version synced to ${weworkerPkg.version}`);
} else {
  console.log(`[prepare-build] extension/manifest.json version already ${manifest.version}, no change.`);
}

// ── Task 2.5: 同步 renderer/package.json 版本号 ──

const RENDERER_PKG_PATH = path.resolve(WEWORKER_ROOT, 'renderer/package.json');
const rendererPkg = JSON.parse(fs.readFileSync(RENDERER_PKG_PATH, 'utf-8'));

if (rendererPkg.version !== weworkerPkg.version) {
  rendererPkg.version = weworkerPkg.version;
  fs.writeFileSync(RENDERER_PKG_PATH, JSON.stringify(rendererPkg, null, 2) + '\n', 'utf-8');
  console.log(`[prepare-build] renderer/package.json version synced to ${weworkerPkg.version}`);
} else {
  console.log(`[prepare-build] renderer/package.json version already ${rendererPkg.version}, no change.`);
}

console.log('[prepare-build] Done.');
