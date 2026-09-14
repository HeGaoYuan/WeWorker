import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanUserChoiceText, normalizeUserChoiceOptions } from '../utils/user-choice.js'

describe('user-choice text normalization', () => {
  it('removes mojibake replacement prefixes from option labels', () => {
    assert.equal(cleanUserChoiceText('锟?选项 2 - 🌧️ 雨天'), '选项 2 - 🌧️ 雨天')
    assert.equal(cleanUserChoiceText('\u951f\uFFFD选项A: 测试通过 ✅'), '选项A: 测试通过 ✅')
    assert.equal(cleanUserChoiceText('\u9221? 🍎 苹果'), '🍎 苹果')
    assert.equal(cleanUserChoiceText('锟斤拷选项 3 - 雪天'), '选项 3 - 雪天')
    assert.equal(cleanUserChoiceText('�选项 1 - 晴天'), '选项 1 - 晴天')
  })

  it('keeps normal Chinese and emoji labels unchanged', () => {
    assert.equal(cleanUserChoiceText('选项 2 - 🌧️ 雨天'), '选项 2 - 🌧️ 雨天')
  })

  it('normalizes option labels and descriptions', () => {
    assert.deepEqual(
      normalizeUserChoiceOptions([
        { label: '锟?选项 2 - 🌧️ 雨天', description: '锟?用于测试' },
      ]),
      [{ label: '选项 2 - 🌧️ 雨天', description: '用于测试' }],
    )
  })
})
