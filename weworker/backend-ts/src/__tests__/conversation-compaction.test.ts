import { describe, expect, it } from 'vitest'
import {
  buildCompactedConversationPrompt,
  planConversationCompaction,
  takeRecentWithinTokenBudget,
} from '../context/conversation-compaction.js'

describe('conversation compaction', () => {
  it('triggers from the conversation budget after reserving runtime context', () => {
    const plan = planConversationCompaction({
      contextLimit: 1000,
      nonConversationTokens: 200,
      conversationTokens: 700,
    })

    expect(plan.shouldCompact).toBeTruthy()
    expect(plan.availableTokens).toBe(800)
    expect(plan.targetTokens).toBe(440)
  })

  it('keeps the newest items and returns the older items for summarization', () => {
    const selection = takeRecentWithinTokenBudget(
      ['old', 'middle', 'new'],
      9,
      (item) => item.length,
    )

    expect(selection.retained).toEqual(['middle', 'new'])
    expect(selection.dropped).toEqual(['old'])
  })

  it('builds a prompt containing only summary and recent conversation', () => {
    expect(buildCompactedConversationPrompt({
      summary: '已完成登录',
      recentConversation: 'User: 查询余额',
    })).toBe('[历史对话摘要]\n已完成登录\n\n[最近对话]\nUser: 查询余额')
  })
})
