const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const BACKEND_TS_ROOT = path.resolve(__dirname, '../backend-ts')
const OUT_DIR = path.resolve(__dirname, '../build/backend-ts-dist')
const OUT_FILE = path.join(OUT_DIR, 'server.cjs')

const KEYRING_PLATFORM_PACKAGES = {
  'win32-x64': '@napi-rs/keyring-win32-x64-msvc',
  'win32-arm64': '@napi-rs/keyring-win32-arm64-msvc',
  'win32-ia32': '@napi-rs/keyring-win32-ia32-msvc',
  'darwin-arm64': '@napi-rs/keyring-darwin-arm64',
  'darwin-x64': '@napi-rs/keyring-darwin-x64',
  'linux-x64': '@napi-rs/keyring-linux-x64-gnu',
  'linux-arm64': '@napi-rs/keyring-linux-arm64-gnu',
}

function copyTreeSync(src, dest) {
  const stat = fs.lstatSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyTreeSync(path.resolve(src, name), path.resolve(dest, name))
    }
    return
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

function copyScopedPackage(packageName, srcRoot, destRoot) {
  const [scope, name] = packageName.split('/')
  const src = path.join(srcRoot, scope, name)
  if (!fs.existsSync(src)) {
    throw new Error(`[bundle-backend-ts] Missing native dependency: ${packageName}`)
  }
  const dest = path.join(destRoot, scope, name)
  copyTreeSync(src, dest)
}

function copyKeyringNativeDeps() {
  const platformKey = `${process.platform}-${process.arch}`
  const platformPackage = KEYRING_PLATFORM_PACKAGES[platformKey]
  const packages = ['@napi-rs/keyring']
  if (platformPackage) packages.push(platformPackage)

  const srcRoot = path.join(BACKEND_TS_ROOT, 'node_modules')
  const destRoot = path.join(OUT_DIR, 'node_modules')
  for (const packageName of packages) {
    copyScopedPackage(packageName, srcRoot, destRoot)
  }
  console.log(`[bundle-backend-ts] Copied native deps: ${packages.join(', ')}`)
}

// Read .build-defines.json for provider injection; fall back to defaults for dev mode
const definesPath = path.resolve(__dirname, '../build/.build-defines.json')
let buildDefines
try {
  buildDefines = JSON.parse(fs.readFileSync(definesPath, 'utf-8'))
} catch {
  console.warn('[bundle-backend-ts] .build-defines.json not found, using built-in defaults (dev mode)')
  buildDefines = {
    providers: [
      { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'], defaultModel: 'claude-sonnet-4-6', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://api.anthropic.com' }, webwright: { protocol: 'anthropic_messages', modelClass: 'anthropic', baseUrl: 'https://api.anthropic.com', structuredOutput: 'anthropic_json_schema' } },
      { id: 'glm', name: '智谱 coding plan', models: ['glm-5.2', 'glm-4.7'], defaultModel: 'glm-5.2', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://open.bigmodel.cn/api/anthropic' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', structuredOutput: 'openai_json_object' } },
      { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], defaultModel: 'deepseek-v4-flash', weworker: { protocol: 'anthropic_messages', baseUrl: 'https://api.deepseek.com/anthropic' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'openai_chat', baseUrl: 'https://api.deepseek.com', structuredOutput: 'openai_json_object' } },
      { id: 'custom', name: '自定义', models: [], defaultModel: '', weworker: { protocol: 'anthropic_messages', baseUrl: '' }, webwright: { protocol: 'openai_chat_completions', modelClass: 'openai_chat', baseUrl: '', structuredOutput: 'openai_json_object' } },
    ],
    defaultProvider: 'anthropic',
  }
}

const keyringExternals = ['@napi-rs/keyring']
const platformPackage = KEYRING_PLATFORM_PACKAGES[`${process.platform}-${process.arch}`]
if (platformPackage) keyringExternals.push(platformPackage)

esbuild.buildSync({
  entryPoints: [path.resolve(BACKEND_TS_ROOT, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: OUT_FILE,
  // node:sqlite is a built-in only available in Node 22+; mark as external
  // @napi-rs/keyring ships platform-specific .node binaries — keep external and copy beside server.cjs
  external: ['node:sqlite', 'node:*', ...keyringExternals],
  define: {
    'import.meta.url': '__importMetaUrl',
    'import.meta.dirname': '__dirname',
    '__BUILD_PROVIDERS__': JSON.stringify(buildDefines.providers),
    '__BUILD_DEFAULT_PROVIDER__': JSON.stringify(buildDefines.defaultProvider),
  },
  banner: {
    js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
})

copyKeyringNativeDeps()

console.log('Backend-TS bundle created: build/backend-ts-dist/server.cjs')
