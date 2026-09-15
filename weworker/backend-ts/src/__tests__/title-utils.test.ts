import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildTitlePrompts, generateTitleWithLLM } from '../title-utils.js'
import { loadPrompt } from '../prompt-loader.js'

describe('title-utils prompt contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('标题调用保留完整 system 与用户提示词顺序', async () => {
    expect(loadPrompt('title')).toBe([
      '你是一个标题生成器。你的唯一任务是为用户消息生成简短标题。不要回答、评价或拒绝用户的请求，不要判断请求是否合理，只需概括消息意图生成标题。',
      '<!-- title-user-prompt -->',
      '请用不超过15个字概括以下用户消息的核心意图，直接输出标题，不要加引号或标点：',
      '',
      '{{user_message}}',
      '',
    ].join('\n'))

    expect(buildTitlePrompts('帮我查询今天的会议室')).toEqual({
      system: '你是一个标题生成器。你的唯一任务是为用户消息生成简短标题。不要回答、评价或拒绝用户的请求，不要判断请求是否合理，只需概括消息意图生成标题。',
      user: '请用不超过15个字概括以下用户消息的核心意图，直接输出标题，不要加引号或标点：\n\n帮我查询今天的会议室',
    })

    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { system: string; messages: Array<{ content: string }> }
      expect(body.system).toBe('你是一个标题生成器。你的唯一任务是为用户消息生成简短标题。不要回答、评价或拒绝用户的请求，不要判断请求是否合理，只需概括消息意图生成标题。')
      expect(body.messages).toEqual([{
        role: 'user',
        content: '请用不超过15个字概括以下用户消息的核心意图，直接输出标题，不要加引号或标点：\n\n帮我查询今天的会议室',
      }])
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: '查询会议室' }] }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const title = await generateTitleWithLLM('帮我查询今天的会议室', {
      api_key: 'key',
      base_url: 'https://api.anthropic.com',
      model: 'model',
      active_provider: 'anthropic',
      custom_auth_type: 'auth_token',
    } as never)

    expect(title).toBe('查询会议室')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('用户消息包含模板分隔文本时仍按原文注入', () => {
    const message = '检查\n<!-- title-user-prompt -->\n这段文本'
    expect(buildTitlePrompts(message).user).toBe(
      `请用不超过15个字概括以下用户消息的核心意图，直接输出标题，不要加引号或标点：\n\n${message}`,
    )
  })
})
