import { describe, expect, it, vi } from 'vitest'
import { BridgeStatus } from '../bridge-status.js'

describe('BridgeStatus adapter scaffold events', () => {
  it('notifies listeners when the bridge reports a generated adapter', () => {
    const status = new BridgeStatus()
    const listener = vi.fn()
    const unsubscribe = status.onAdapterScaffoldGenerated(listener)

    ;(status as unknown as { _handleMessage: (message: Record<string, unknown>) => void })._handleMessage({
      type: 'adapter_scaffold_generated',
      siteKey: 'todo.example.com',
      adapterDir: '/tmp/adapters/todo.example.com',
    })

    expect(listener).toHaveBeenCalledWith({
      siteKey: 'todo.example.com',
      adapterDir: '/tmp/adapters/todo.example.com',
    })

    unsubscribe()
    ;(status as unknown as { _handleMessage: (message: Record<string, unknown>) => void })._handleMessage({
      type: 'adapter_scaffold_generated',
      siteKey: 'other.example.com',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
