import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import { insertSteeringIntoMessages, updateAssistantMessages } from '../utils/chat-stream-events.js'

test('steering appears after the output already shown, with subsequent output below it', () => {
  const source = readFileSync(new URL('../components/chat/ChatView.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  const insertSteeringMessage = ')
  const end = source.indexOf('\n  queue.setHandlers', start)
  let state = { messages: { fixture: [
    { id: 'original', role: 'user', content: [{ type: 'text', text: 'open example.com' }] },
    { id: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Opening the page' }, { type: 'tool_use', id: 'tool-1', status: 'running' }] },
  ] }, streamingWorkIds: new Set(['fixture']) }
  const context = vm.createContext({ workId: 'fixture', insertSteeringIntoMessages, useWorksStore: {
    setState: update => { state = { ...state, ...update(state) } },
    getState: () => state,
  } })
  vm.runInContext(source.slice(start, end) + '\nglobalThis.insert = insertSteeringMessage', context)
  context.insert({ id: 'steer', role: 'user', content: [{ type: 'text', text: 'hello' }] })
  assert.deepEqual(state.messages.fixture.map(message => message.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(state.messages.fixture[1].content[0].text, 'Opening the page')
  assert.equal(state.messages.fixture[2].id, 'steer')
  assert.equal(state.messages.fixture[3].content.length, 0)
})

test('tool results update their original segment after multiple steering messages', () => {
  let messages = [{ id: 'before', role: 'assistant', content: [{ type: 'tool_use', id: 'fixture-tool', status: 'running' }] }]
  messages = insertSteeringIntoMessages(messages, { id: 'steer-1', role: 'user', content: [] })
  messages = insertSteeringIntoMessages(messages, { id: 'steer-2', role: 'user', content: [] })
  const updated = updateAssistantMessages(messages, { type: 'tool_call_result', id: 'fixture-tool' }, message => ({ ...message, content: message.content.map(block => ({ ...block, status: 'done' })) }))
  assert.equal(updated[0].content[0].status, 'done')
  assert.equal(updated.at(-1).content.length, 0)
  assert.deepEqual(updated.map(message => message.id), ['before', 'steer-1', 'steer-2', 'steer-2-continuation'])
  assert.equal(insertSteeringIntoMessages(updated, { id: 'steer-1' }), updated)
})

test('server boundary snapshots reconcile text and ids before the new user bubble', () => {
  const previous = { id: 'optimistic', streamingTurnId: 'fixture-turn', role: 'assistant', content: [{ type: 'text', text: 'partial' }] }
  const saved = { id: 'stored', role: 'assistant', content: [{ type: 'text', text: 'partial complete' }] }
  const result = insertSteeringIntoMessages([previous], { id: 'steer', role: 'user', content: [] }, saved)
  assert.equal(result[0].id, 'stored')
  assert.equal(result[0].content[0].text, 'partial complete')
  assert.equal(result.at(-1).streamingTurnId, 'fixture-turn')
})
