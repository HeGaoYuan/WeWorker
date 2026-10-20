import { describe, expect, it } from 'vitest'
import { createChatTurnRegistry } from '../chat-turn-lifecycle.js'

describe('chat turn lifecycle', () => {
  it('rejects overlap in one conversation but allows independent conversations', () => {
    const turns = createChatTurnRegistry()
    const a = turns.start('work-a')!
    expect(turns.start('work-a')).toBeNull()
    expect(turns.start('work-b')).not.toBeNull()
    a.finish()
    expect(turns.start('work-a')).not.toBeNull()
    a.finish()
    expect(turns.start('work-a')).toBeNull()
  })
  it('acknowledges stop only after the handler finishes persistence and cleanup', async () => {
    const turns = createChatTurnRegistry()
    const turn = turns.start('work-a')!
    let acknowledged = false
    const stopping = turns.stop('work-a').then(result => { acknowledged = true; return result })
    expect(turn.controller.signal.aborted).toBe(true)
    await Promise.resolve()
    expect(acknowledged).toBe(false)
    expect(turns.start('work-a')).toBeNull()
    turn.finish()
    expect(await stopping).toBe('stopped')
    expect(turns.start('work-a')).not.toBeNull()
  })
  it('retains the busy lock if cancellation times out', async () => {
    const turns = createChatTurnRegistry()
    const turn = turns.start('work-a')!
    expect(await turns.stop('work-a', 5)).toBe('timeout')
    expect(turns.start('work-a')).toBeNull()
    turn.finish()
    expect(await turns.stop('work-a')).toBe('idle')
  })
})
