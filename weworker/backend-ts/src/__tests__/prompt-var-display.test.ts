import { describe, it, expect } from 'vitest'
import { formatPromptForDisplay, formatPromptForFill } from '../prompt-var-display.js'

describe('prompt-var-display', () => {
  const map = {
    'bdp-portal': { label: 'bdp-portal', style: 'code' as const },
  }

  it('shows code id instead of ellipsis', () => {
    const text = '帮我在SCM看看${bdp-portal}产品线当前最新的版本是多少'
    expect(formatPromptForDisplay(text, map)).toContain('bdp-portal')
    expect(formatPromptForDisplay(text, map)).not.toContain('…')
  })

  it('fills chat with literal id', () => {
    const text = '帮我在SCM看看${bdp-portal}产品线'
    expect(formatPromptForFill(text, map)).toBe('帮我在SCM看看bdp-portal产品线')
  })

  it('placeholder for Chinese vars', () => {
    expect(formatPromptForDisplay('搜索${发票}', {})).toContain('…')
  })
})
