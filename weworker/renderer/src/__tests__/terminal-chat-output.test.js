import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyTerminalEventToMessages } from '../utils/terminal-chat-output.js'
import { formatToolResultText } from '../utils/tool-display.js'

describe('terminal chat output', () => {
  it('appends WeWorker Shell output chunks to the running tool block', () => {
    const messages = [{
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tool-1',
        name: 'weworker_powershell',
        args: { command: 'git clone repo' },
        status: 'running',
      }],
    }]

    const first = applyTerminalEventToMessages(messages, {
      type: 'terminal_event',
      data: {
        event: 'output',
        workId: 'work-1',
        sessionId: 'ps-1',
        command: 'git clone repo',
        chunk: 'Cloning into repo...\n',
      },
    })

    const second = applyTerminalEventToMessages(first, {
      type: 'terminal_event',
      data: {
        event: 'output',
        workId: 'work-1',
        sessionId: 'ps-1',
        command: 'git clone repo',
        chunk: 'Receiving objects: 100%\n',
      },
    })

    const block = second[0].content[0]
    assert.equal(block.liveOutput, 'Cloning into repo...\nReceiving objects: 100%\n')
    assert.equal(formatToolResultText(block, ''), 'Cloning into repo...\nReceiving objects: 100%\n')
  })

  it('deduplicates terminal chunks delivered by both chat and global SSE streams', () => {
    const messages = [{
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tool-1',
        name: 'weworker_powershell',
        args: { command: 'git clone repo' },
        status: 'running',
      }],
    }]

    const event = {
      type: 'terminal_event',
      data: {
        event: 'output',
        workId: 'work-1',
        sessionId: 'ps-1',
        command: 'git clone repo',
        stream: 'stderr',
        at: '2026-07-09T08:00:00.000Z',
        chunk: "Cloning into 'repo'...\n",
      },
    }

    const first = applyTerminalEventToMessages(messages, event)
    const second = applyTerminalEventToMessages(first, event)

    assert.equal(second[0].content[0].liveOutput, "Cloning into 'repo'...\n")
    assert.equal(Object.prototype.hasOwnProperty.call(second[0].content[0], 'terminalEventKeys'), false)
  })

  it('does not update non-shell tools', () => {
    const messages = [{
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tool-1',
        name: 'webcli_result',
        args: { command: 'git clone repo' },
        status: 'running',
      }],
    }]

    const next = applyTerminalEventToMessages(messages, {
      type: 'terminal_event',
      data: {
        event: 'output',
        sessionId: 'ps-1',
        command: 'git clone repo',
        chunk: 'ignored',
      },
    })

    assert.equal(next, messages)
  })
})
