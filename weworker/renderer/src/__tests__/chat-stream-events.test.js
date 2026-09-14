import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyAssistantStreamEvent } from '../utils/chat-stream-events.js'

describe('chat-stream-events', () => {
  it('replaces the current assistant message with corrected tool and text content', () => {
    const message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'old reply' }],
    }
    const correctedContent = [
      {
        type: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        args: { todos: [{ content: 'Verify', status: 'in_progress' }] },
        status: 'done',
      },
      { type: 'text', text: 'corrected reply' },
    ]

    const next = applyAssistantStreamEvent(message, {
      type: 'replace_assistant_content',
      content: correctedContent,
    })

    assert.deepEqual(next.content, correctedContent)
  })

  it('preserves the turn-timing footer when replacing assistant content', () => {
    const timingBlock = { type: 'timing', totalMs: 4200, llmMs: 1000, execMs: 3200, steps: 2 }
    const message = {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: '1', name: 'Bash', args: {}, status: 'done' },
        { type: 'text', text: 'old reply' },
        timingBlock,
      ],
    }
    const correctedContent = [
      {
        type: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        args: { todos: [{ content: 'Verify', status: 'in_progress' }] },
        status: 'done',
      },
      { type: 'text', text: 'corrected reply' },
    ]

    const next = applyAssistantStreamEvent(message, {
      type: 'replace_assistant_content',
      content: correctedContent,
    })

    // Corrected content comes first, timing footer carried over at the end
    assert.equal(next.content.length, 3)
    assert.deepEqual(next.content[0], correctedContent[0])
    assert.deepEqual(next.content[1], correctedContent[1])
    assert.deepEqual(next.content[2], timingBlock)
  })

  it('keeps existing tool blocks when replacing only assistant text', () => {
    const message = {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: '1', name: 'Bash', args: {}, status: 'done' },
        { type: 'text', text: 'old reply' },
      ],
    }

    const next = applyAssistantStreamEvent(message, {
      type: 'replace_assistant_text',
      content: 'new reply',
    })

    assert.equal(next.content.length, 2)
    assert.equal(next.content[0].type, 'tool_use')
    assert.deepEqual(next.content[1], { type: 'text', text: 'new reply' })
  })
})
