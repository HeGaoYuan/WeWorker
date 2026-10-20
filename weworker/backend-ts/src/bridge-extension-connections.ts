export type BridgeExtensionInstance = 'system' | 'dedicated'

export interface BridgeExtensionSnapshot {
  connected: boolean
  version: string | null
  capabilities: string[]
  instance: BridgeExtensionInstance
  count: number
}

type Connection = {
  key: string
  contextId: string | null
  connectionId: string | null
  version: string | null
  capabilities: string[]
  instance: BridgeExtensionInstance
  sequence: number
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function capabilities(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item))]
    : []
}

/**
 * Aggregates the Bridge's per-browser extension events for clients that need a
 * single effective status. The Bridge-owned dedicated browser wins; otherwise
 * the most recently announced live connection is shown.
 */
export class BridgeExtensionConnections {
  private readonly _connections = new Map<string, Connection>()
  private _sequence = 0

  connected(message: Record<string, unknown>): void {
    const contextId = text(message.contextId)
    const connectionId = text(message.connectionId)
    const key = contextId ? `context:${contextId}` : connectionId ? `connection:${connectionId}` : 'legacy'
    this._connections.set(key, {
      key,
      contextId,
      connectionId,
      version: text(message.version),
      capabilities: capabilities(message.capabilities),
      instance: message.instance === 'dedicated' ? 'dedicated' : 'system',
      sequence: ++this._sequence,
    })
  }

  /** Returns true when the event means every extension is gone. */
  disconnected(message: Record<string, unknown>): boolean {
    const contextId = text(message.contextId)
    const connectionId = text(message.connectionId)
    if (!contextId && !connectionId) {
      // Compatibility with old Bridges, whose disconnect event was global.
      this._connections.clear()
      return true
    }
    for (const [key, connection] of this._connections) {
      if ((contextId && connection.contextId === contextId)
        || (connectionId && connection.connectionId === connectionId)) {
        this._connections.delete(key)
      }
    }
    return this._connections.size === 0
  }

  clear(): void {
    this._connections.clear()
  }

  snapshot(): BridgeExtensionSnapshot {
    const live = [...this._connections.values()]
    const selected = live
      .sort((left, right) => right.sequence - left.sequence)
      .find((connection) => connection.instance === 'dedicated')
      ?? live.sort((left, right) => right.sequence - left.sequence)[0]
    return selected
      ? {
          connected: true,
          version: selected.version,
          capabilities: [...selected.capabilities],
          instance: selected.instance,
          count: live.length,
        }
      : { connected: false, version: null, capabilities: [], instance: 'system', count: 0 }
  }
}
