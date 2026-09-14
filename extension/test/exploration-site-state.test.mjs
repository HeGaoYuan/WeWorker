import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const serviceWorkerSource = fs.readFileSync(
  new URL('../background/service-worker.js', import.meta.url),
  'utf8',
)

function extractSource(startMarker, endMarker) {
  const start = serviceWorkerSource.indexOf(startMarker)
  const end = serviceWorkerSource.indexOf(endMarker, start)
  assert.ok(start >= 0, `missing start marker: ${startMarker}`)
  assert.ok(end > start, `missing end marker: ${endMarker}`)
  return serviceWorkerSource.slice(start, end)
}

test('manifest exposes exploration content script on ordinary websites', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  assert.ok(manifest.host_permissions.includes('<all_urls>'))
  assert.ok(manifest.content_scripts.some((entry) => entry.matches?.includes('<all_urls>') && entry.js?.includes('content/injector.js')))
})

test('exploration message injects the receiver and retries once when a new site has no content script', async () => {
  let sendCount = 0
  let injectionCount = 0
  const chrome = {
    tabs: {
      async sendMessage() {
        sendCount += 1
        if (sendCount === 1) throw new Error('Could not establish connection. Receiving end does not exist.')
        return { result: { title: 'new site' } }
      },
    },
    scripting: {
      async executeScript(options) {
        injectionCount += 1
        assert.equal(Array.from(options.files).join(','), 'content/injector.js')
      },
    },
  }
  const context = vm.createContext({ chrome })
  const source = extractSource(
    'function isMissingExplorationReceiverError',
    'chrome.debugger.onEvent.addListener',
  )
  vm.runInContext(`${source}\nglobalThis.__sendExplorationMessage = sendExplorationMessage;`, context)

  const result = await context.__sendExplorationMessage(42, { type: 'browser_state' })
  assert.equal(result.title, 'new site')
  assert.equal(sendCount, 2)
  assert.equal(injectionCount, 1)
})

test('saved exploration results are isolated by site', async () => {
  const storageData = {}
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(list.filter((key) => key in storageData).map((key) => [key, storageData[key]]))
        },
        async set(values) {
          Object.assign(storageData, values)
        },
      },
    },
    tabs: {
      async get(tabId) {
        return { id: tabId, url: tabId === 1 ? 'https://first.example/page' : 'https://second.example/page' }
      },
    },
  }
  const context = vm.createContext({ chrome, URL, Object, Number, String, Date })
  const source = extractSource(
    'function normalizeExploreStateSiteKey',
    '// ─── 来自 Content Script / 测试页面的消息',
  )
  vm.runInContext(`${source}\nglobalThis.__stateApi = { saveExploreState, loadExploreState };`, context)

  await context.__stateApi.saveExploreState(
    { type: 'workflow', result: { site: 'first' }, timestamp: 100 },
    { siteKey: 'first.example', tabId: 1 },
  )
  await context.__stateApi.saveExploreState(
    { type: 'workflow_error', error: 'second failed', timestamp: 200 },
    { siteKey: 'second.example', tabId: 2 },
  )

  const first = await context.__stateApi.loadExploreState({ siteKey: 'first.example', tabId: 1 })
  const second = await context.__stateApi.loadExploreState({ siteKey: 'second.example', tabId: 2 })
  const unknown = await context.__stateApi.loadExploreState({ siteKey: 'unknown.example', tabId: 3 })

  assert.equal(first.result.site, 'first')
  assert.equal(second.error, 'second failed')
  assert.equal(unknown, null)
})
