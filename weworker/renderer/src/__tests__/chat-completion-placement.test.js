import test from 'node:test'
import assert from 'node:assert/strict'
import { getChatCompletionPlacement } from '../utils/chat-completion-placement.js'

test('bottom composer opens above without covering its input or queue', () => {
  const placement = getChatCompletionPlacement({
    anchor: { left: 360, top: 560, bottom: 800, width: 880 },
    viewportWidth: 1280, viewportHeight: 850,
  })
  assert.equal(placement.width, 560)
  assert.equal(850 - placement.bottom, 552)
  assert.equal(placement.top, undefined)
  assert.equal(placement.maxHeight, 264)
})

test('top composer opens below when there is insufficient room above', () => {
  const placement = getChatCompletionPlacement({
    anchor: { left: 20, top: 40, bottom: 200, width: 600 },
    viewportWidth: 900, viewportHeight: 700,
  })
  assert.equal(placement.top, 208)
  assert.equal(placement.bottom, undefined)
})

test('narrow and short windows keep the menu inside the viewport', () => {
  const placement = getChatCompletionPlacement({
    anchor: { left: 40, top: 150, bottom: 300, width: 400 },
    viewportWidth: 320, viewportHeight: 320,
  })
  assert.equal(placement.left, 8)
  assert.equal(placement.width, 304)
  assert.equal(placement.maxHeight, 134)
  assert.equal(320 - placement.bottom - placement.maxHeight, 8)
})
