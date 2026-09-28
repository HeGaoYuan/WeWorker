import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getPortConflictHelp } from '../utils/port-conflict-help.js'

describe('port conflict help', () => {
  it('shows a Windows command that identifies the listener without terminating it', () => {
    const help = getPortConflictHelp(3711, true)
    assert.equal(help.command, 'netstat -ano | findstr :3711')
    assert.match(help.title, /任务管理器/)
    assert.doesNotMatch(help.command, /kill|taskkill|Stop-Process/i)
  })

  it('uses lsof to identify the listener on macOS and Linux', () => {
    const help = getPortConflictHelp(3711, false)
    assert.equal(help.command, 'lsof -nP -iTCP:3711 -sTCP:LISTEN')
    assert.doesNotMatch(help.command, /kill|taskkill|Stop-Process/i)
  })
})
