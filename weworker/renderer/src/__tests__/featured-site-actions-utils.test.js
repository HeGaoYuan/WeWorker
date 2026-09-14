import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actionVisibilityStyle,
  canShowFeaturedColumnActions,
  expandRect,
  getFeaturedColumnActionsMinHeight,
  rectsOverlap,
  setsEqual,
  sortActionsForAdaptiveHiding,
} from '../utils/featured-site-actions-utils.js'

describe('featured-site-actions utils', () => {
  it('detects overlapping rects with inset', () => {
    const a = { left: 0, top: 0, right: 30, bottom: 20 }
    const b = { left: 20, top: 0, right: 44, bottom: 20 }
    assert.equal(rectsOverlap(a, b), true)
    assert.equal(rectsOverlap(a, { left: 40, top: 0, right: 60, bottom: 20 }), false)
  })

  it('expands rects by padding', () => {
    const expanded = expandRect({ left: 10, top: 10, right: 20, bottom: 20 }, 4)
    assert.deepEqual(expanded, { left: 6, top: 6, right: 24, bottom: 24 })
  })

  it('prefers hiding rightmost actions in row layout', () => {
    const actions = [
      { key: 'left', rect: { left: 100, top: 0, right: 120, bottom: 20 } },
      { key: 'right', rect: { left: 140, top: 0, right: 160, bottom: 20 } },
    ]
    const sorted = sortActionsForAdaptiveHiding(actions, 'row', (action) => action.rect)
    assert.equal(sorted[0].key, 'right')
  })

  it('prefers hiding bottom actions in column layout', () => {
    const actions = [
      { key: 'top', rect: { left: 0, top: 0, right: 20, bottom: 20 } },
      { key: 'bottom', rect: { left: 0, top: 40, right: 20, bottom: 60 } },
    ]
    const sorted = sortActionsForAdaptiveHiding(actions, 'column', (action) => action.rect)
    assert.equal(sorted[0].key, 'bottom')
  })

  it('compares hidden action sets', () => {
    assert.equal(setsEqual(new Set(['a']), new Set(['a'])), true)
    assert.equal(setsEqual(new Set(['a']), new Set(['b'])), false)
  })

  it('builds visibility styles for hidden actions', () => {
    const hidden = new Set(['site:try'])
    const forceVisible = new Set()
    assert.deepEqual(actionVisibilityStyle('site:try', hidden, forceVisible), { display: 'none' })
    assert.equal(actionVisibilityStyle('site:try', hidden, new Set(['site:try'])), null)
  })

  it('computes minimum column action stack height', () => {
    assert.equal(getFeaturedColumnActionsMinHeight(), 103)
  })

  it('hides column actions when card is too small', () => {
    const card = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 112,
        bottom: 102,
        width: 112,
        height: 102,
      }),
      querySelectorAll: () => [],
    }
    assert.equal(canShowFeaturedColumnActions(card), false)
    card.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 112,
      bottom: 112,
      width: 112,
      height: 112,
    })
    assert.equal(canShowFeaturedColumnActions(card), true)
  })
})
