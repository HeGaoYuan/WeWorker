import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BROWSER_MODE_OPTIONS, describeBrowserMode, describeDedicatedBrowserStatus } from '../utils/dedicated-browser.js'

describe('WeWorker browser display', () => {
  it('offers both browser modes with WeWorker browser first', () => {
    assert.deepEqual(BROWSER_MODE_OPTIONS.map((option) => option.value), ['dedicated', 'system'])
    assert.match(describeBrowserMode('dedicated'), /不会打扰你/)
    assert.match(describeBrowserMode('system'), /手动安装扩展/)
  })

  it('maps each manager state to text and the actions that apply', () => {
    assert.deepEqual(
      { ...describeDedicatedBrowserStatus({ status: 'running', browser: 'Microsoft Edge' }), text: undefined },
      { tone: 'ok', text: undefined, canShow: true, canRestart: true },
    )
    assert.match(describeDedicatedBrowserStatus({ status: 'running', browser: 'Microsoft Edge' }).text, /Microsoft Edge/)
    assert.equal(describeDedicatedBrowserStatus({ status: 'starting' }).canShow, false)
    assert.match(describeDedicatedBrowserStatus({ status: 'unavailable', detail: '未找到 Chrome 或 Microsoft Edge' }).text, /未找到 Chrome/)
    assert.match(describeDedicatedBrowserStatus({ status: 'error', detail: 'extension rejected' }).text, /extension rejected/)
    assert.equal(describeDedicatedBrowserStatus({ status: 'profile_in_use' }).tone, 'warn')
    assert.equal(describeDedicatedBrowserStatus(null).canRestart, true)
  })

  it('never shows the source package name to users', () => {
    const files = [
      '../utils/dedicated-browser.js',
      '../components/ExtensionGuide.jsx',
    ].map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8'))
    for (const source of files) assert.doesNotMatch(source, /webwright/i)
  })
})
