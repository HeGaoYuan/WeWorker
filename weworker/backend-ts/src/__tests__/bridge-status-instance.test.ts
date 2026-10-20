import { describe, expect, it } from 'vitest'
import { BridgeStatus } from '../bridge-status.js'

describe('bridge status: which browser serves Adapter calls', () => {
  it('keeps the dedicated instance selected while another browser connects or disconnects', () => {
    const status = new BridgeStatus()
    expect(status.getExtensionInstance()).toBe('system')
    status.handleMessageForTest({ type: 'extension_connected', contextId: 'dedicated-profile', connectionId: 'dedicated-1', version: '1.1.0', instance: 'dedicated' })
    expect(status.isExtensionConnected()).toBe(true)
    expect(status.getExtensionInstance()).toBe('dedicated')
    status.handleMessageForTest({ type: 'extension_connected', contextId: 'system-profile', connectionId: 'system-1', version: '1.1.0', instance: 'system' })
    expect(status.getExtensionInstance()).toBe('dedicated')
    status.handleMessageForTest({ type: 'extension_disconnected', contextId: 'system-profile', instance: 'system' })
    expect(status.isExtensionConnected()).toBe(true)
    expect(status.getExtensionInstance()).toBe('dedicated')
    status.handleMessageForTest({ type: 'extension_disconnected', contextId: 'dedicated-profile', instance: 'dedicated' })
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
