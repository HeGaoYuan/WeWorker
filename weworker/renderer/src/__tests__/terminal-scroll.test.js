import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getScrollAdjustmentForRect } from '../utils/terminal-scroll.js'

describe('terminal scroll helpers', () => {
  it('scrolls down when the target bottom is below the viewport', () => {
    assert.equal(
      getScrollAdjustmentForRect({
        containerTop: 100,
        containerBottom: 300,
        targetTop: 250,
        targetBottom: 340,
        padding: 8,
      }),
      48,
    )
  })

  it('scrolls up when the target top is above the viewport', () => {
    assert.equal(
      getScrollAdjustmentForRect({
        containerTop: 100,
        containerBottom: 300,
        targetTop: 70,
        targetBottom: 140,
        padding: 8,
      }),
      -38,
    )
  })

  it('does not scroll when the target is already visible', () => {
    assert.equal(
      getScrollAdjustmentForRect({
        containerTop: 100,
        containerBottom: 300,
        targetTop: 130,
        targetBottom: 260,
        padding: 8,
      }),
      0,
    )
  })
})
