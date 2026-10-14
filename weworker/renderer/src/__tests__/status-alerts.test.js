import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildStatusAlerts } from '../utils/status-alerts.js'

const healthy = { extension: 'connected', appVersion: '1.0.0', extensionVersion: '1.0.0', bridgeStatus: 'running', backendStatus: 'running', channels: {} }

test('clears resolved alerts and does not show stale extension version warnings while disconnected', () => {
  assert.deepEqual(buildStatusAlerts(healthy), [])
  const alerts = buildStatusAlerts({ ...healthy, extension: 'disconnected', extensionVersion: '0.2.6' })
  assert.deepEqual(alerts.map(alert => alert.id), ['extension-disconnected'])
  assert.equal(alerts[0].guide, true)
})

test('keeps version, port and channel details in distinct alert entries', () => {
  const alerts = buildStatusAlerts({ ...healthy, extensionVersion: '0.2.6', bridgeStatus: 'port_in_use', backendStatus: 'port_in_use',
    channels: { qq: { status: 'error', error: 'fixture connection failure' }, wecom: { status: 'connected' } }, isWindows: true })
  assert.deepEqual(alerts.map(alert => alert.id), ['extension-version', 'port-3711', 'port-8765', 'channel-qq'])
  assert.match(alerts[0].detail, /v1\.0\.0/)
  assert.match(alerts[0].detail, /v0\.2\.6/)
  assert.equal(alerts[1].command, 'netstat -ano | findstr :3711')
  assert.equal(alerts[2].command, 'netstat -ano | findstr :8765')
  assert.equal(alerts[3].detail, 'fixture connection failure')
})

test('provides read-only port inspection commands for macOS and Linux', () => {
  const [alert] = buildStatusAlerts({ ...healthy, bridgeStatus: 'port_in_use', isWindows: false })
  assert.equal(alert.command, 'lsof -nP -iTCP:3711 -sTCP:LISTEN')
})
