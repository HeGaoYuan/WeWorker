'use strict'

/**
 * bundle-webcli.cjs — Bundle webcli CLI into a single file for packaged WeWorker.
 *
 * Outputs:
 *   build/webcli-dist/webcli.cjs   — bundled CLI (CJS format)
 *   build/webcli-dist/webcli        — shell wrapper for macOS / Unix
 */

const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '../..')
const outDir = path.resolve(__dirname, '../build/webcli-dist')

for (const legacyWrapper of ['webcli-py', 'webcli-py.cmd']) {
  const legacyPath = path.join(outDir, legacyWrapper)
  if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath)
}

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(srcPath)
      try { fs.symlinkSync(target, destPath) } catch {
        const realPath = fs.realpathSync(srcPath)
        if (fs.statSync(realPath).isDirectory()) {
          copyDirRecursive(realPath, destPath)
        } else {
          fs.copyFileSync(realPath, destPath)
        }
      }
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// 1. Bundle webcli/index.js
esbuild.buildSync({
  entryPoints: [path.resolve(projectRoot, 'webcli/index.js')],
  absWorkingDir: projectRoot,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(outDir, 'webcli.cjs'),
  define: {
    'import.meta.url': '__importMetaUrl',
    'import.meta.dirname': '__dirname',
  },
  banner: {
    js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
})

console.log('WebCLI bundle created: build/webcli-dist/webcli.cjs')

// 2. Create shell wrapper script for macOS / Unix
//
// Packaged WeWorker: users don't have Node.js installed. The Electron binary
// (WeWorker.exe / WeWorker) is in a parent directory and can act as a Node.js
// runtime when ELECTRON_RUN_AS_NODE=1 is set. The wrapper tries the Electron
// binary first, falling back to system `node` for development mode.
const wrapperPath = path.join(outDir, 'webcli')
const wrapperContent = `#!/bin/sh
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"

# Try to find the Electron executable relative to this script.
# Packaged layout (Windows): <root>/WeWorker.exe          + resources/webcli/
# Packaged layout (macOS):    <root>/Contents/MacOS/WeWorker + Contents/Resources/webcli/
ELECTRON=""
for candidate in \\
  "$SELF_DIR/../../WeWorker.exe" \\
  "$SELF_DIR/../../../WeWorker.exe" \\
  "$SELF_DIR/../../MacOS/WeWorker" \\
  "$SELF_DIR/../../node_modules/electron/dist/electron.exe" \\
  "$SELF_DIR/../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"; do
  if [ -x "\$candidate" ]; then
    ELECTRON="\$candidate"
    break
  fi
done

if [ -n "\$ELECTRON" ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "\$ELECTRON" "$SELF_DIR/webcli.cjs" "\$@"
else
  # Dev fallback: system node should be available
  exec node "$SELF_DIR/webcli.cjs" "\$@"
fi
`
fs.writeFileSync(wrapperPath, wrapperContent, 'utf-8')

// Make executable on Unix (no-op on Windows, but harmless)
try { fs.chmodSync(wrapperPath, 0o755) } catch {}

console.log('WebCLI wrapper created: build/webcli-dist/webcli')

// 3. Create Windows .cmd wrapper for PowerShell and cmd.exe
const cmdWrapperPath = path.join(outDir, 'webcli.cmd')
const cmdWrapperContent = `@echo off
setlocal

set "SELF_DIR=%~dp0"

REM Try to find Electron executable (packaged WeWorker)
set "ELECTRON="
if exist "%SELF_DIR%..\\..\\WeWorker.exe" (
  set "ELECTRON=%SELF_DIR%..\\..\\WeWorker.exe"
) else if exist "%SELF_DIR%..\\..\\..\\WeWorker.exe" (
  set "ELECTRON=%SELF_DIR%..\\..\\..\\WeWorker.exe"
) else if exist "%SELF_DIR%..\\..\\node_modules\\electron\\dist\\electron.exe" (
  set "ELECTRON=%SELF_DIR%..\\..\\node_modules\\electron\\dist\\electron.exe"
)

if defined ELECTRON (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ELECTRON%" "%SELF_DIR%webcli.cjs" %*
) else (
  node "%SELF_DIR%webcli.cjs" %*
)
`
fs.writeFileSync(cmdWrapperPath, cmdWrapperContent, 'utf-8')

console.log('WebCLI cmd wrapper created: build/webcli-dist/webcli.cmd')

// 4. Copy adapter metadata for dev-mode bundled webcli.
//
// In dev mode the backend puts build/webcli-dist on PATH after running this
// script. The bundled webcli resolves adapters from either ./extension or
// ../extension relative to webcli.cjs, so without this copy it cannot see the
// repo's current extension/adapters tree and may leave stale runtime skills in
// place. Packaged builds do not ship this copied folder because extraResources
// only includes webcli/webcli.cjs/webcli.cmd/skills from build/webcli-dist.
const adaptersSrcDir = path.resolve(projectRoot, 'extension/adapters')
const adaptersDestDir = path.join(outDir, 'extension/adapters')
if (fs.existsSync(adaptersSrcDir)) {
  fs.rmSync(adaptersDestDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(adaptersDestDir), { recursive: true })
  copyDirRecursive(adaptersSrcDir, adaptersDestDir)
  console.log('Extension adapters copied: build/webcli-dist/extension/adapters/')
} else {
  console.warn('[bundle-webcli] extension/adapters not found, bundled webcli adapter commands may be unavailable')
}

// 5. Copy bundled skills directory (base webcli SKILL.md).
//
// The base skill (skills/webcli/SKILL.md) is a static file, not generated from
// adapter source. installSkills() copies it from <webcli>/skills/webcli/SKILL.md
// at runtime. In packaged builds the webcli entry lives in resources/webcli/, so
// the skills dir must sit alongside it as resources/webcli/skills/. Copy it into
// the bundle output here, and make sure package.json extraResources ships it.
const skillsSrcDir = path.resolve(projectRoot, 'webcli/skills')
const skillsDestDir = path.join(outDir, 'skills')
if (fs.existsSync(skillsSrcDir)) {
  fs.rmSync(skillsDestDir, { recursive: true, force: true })
  copyDirRecursive(skillsSrcDir, skillsDestDir)
  console.log('WebCLI skills copied: build/webcli-dist/skills/')
} else {
  console.warn('[bundle-webcli] webcli/skills not found, skipping base skill copy')
}
