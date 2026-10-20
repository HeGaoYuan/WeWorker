import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { streamChat } from '../api/backend.js'

const originalFetch = global.fetch
const originalWindow = global.window
afterEach(() => { global.fetch = originalFetch; global.window = originalWindow })
function response(payload) {
  global.window = {}
  global.fetch = async () => new Response(payload, { headers: { 'Content-Type': 'text/event-stream' } })
}
test('an unexpected EOF fails instead of advancing the message queue', async () => {
  response('data: {"type":"text_delta","content":"partial"}\n\n')
  await assert.rejects(streamChat('fixture-work', 'hello', () => {}, new AbortController().signal), /中断/)
})
test('turn_end followed by EOF completes normally', async () => {
  response('data: {"type":"turn_end"}\n\n')
  await streamChat('fixture-work', 'hello', () => {}, new AbortController().signal)
})
test('the explicit DONE marker remains compatible', async () => {
  response('data: [DONE]\n\n')
  await streamChat('fixture-work', 'hello', () => {}, new AbortController().signal)
})
test('a model done event alone cannot end a request with pending steering', async () => {
  response('data: {"type":"done"}\n\n')
  await assert.rejects(streamChat('fixture-work', 'hello', () => {}, new AbortController().signal), /中断/)
})
