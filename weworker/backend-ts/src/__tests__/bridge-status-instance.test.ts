import { describe, expect, it } from 'vitest'
import { BridgeStatus } from '../bridge-status.js'

describe('bridge status: which browser serves Adapter calls', () => {
  it('follows the instance reported with extension_connected', () => {
    const status = new BridgeStatus()
    expect(status.getExtensionInstance()).toBe('system')
    status.handleMessageForTest({ type: 'extension_connected', version: '1.1.0', instance: 'dedicated' })
    expect(status.isExtensionConnected()).toBe(true)
    expect(status.getExtensionInstance()).toBe('dedicated')
    // Handover to the user's own Chrome.
    status.handleMessageForTest({ type: 'extension_connected', version: '1.1.0', instance: 'system' })
    expect(status.getExtensionInstance()).toBe('system')
    status.handleMessageForTest({ type: 'extension_connected', version: '1.1.0', instance: 'dedicated' })
    status.handleMessageForTest({ type: 'extension_disconnected' })
    expect(status.isExtensionConnected()).toBe(false)
    expect(status.getExtensionInstance()).toBe('system')
  })

  it('treats bridges without the field as the user\'s Chrome', () => {
    const status = new BridgeStatus()
    status.handleMessageForTest({ type: 'extension_connected', version: '1.0.0' })
    expect(status.getExtensionInstance()).toBe('system')
    status.handleMessageForTest({ type: 'extension_connected', instance: 'unexpected' })
    expect(status.getExtensionInstance()).toBe('system')
  })
})
