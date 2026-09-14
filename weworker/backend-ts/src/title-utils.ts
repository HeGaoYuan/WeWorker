/**
 * Shared title generation utilities — used by both desktop chat (server.ts)
 * and channel integrations (weixin, qq).
 */
import type { Settings } from './config.js'
import { createLogger } from './logger.js'
import { assertAllowedLlmBaseUrl } from './llm-egress.js'
import { buildRuntimeAllowedLlmBaseUrls } from './provider-registry.js'

const log = createLogger('title')

/** Generate a concise title from the user's first message (text truncation). */
export function generateTitle(message: string): string {
  let text = message.trim()
  // Remove common polite prefixes
  text = text.replace(/^(请你?|帮我|麻烦|能不能|可以).{0,2}(?=[\u4e00-\u9fff])/u, '')
  // Truncate at a natural break (punctuation, newline) between 6–30 chars
  const breakMatch = text.match(/^(.{6,30}?)[，。！？\n,.\-;；]/)
  if (breakMatch) return breakMatch[1]
  // Otherwise just take first 30 chars
  return text.slice(0, 30) + (text.length > 30 ? '…' : '')
}

/**
 * Call the configured LLM provider to generate a concise conversation title.
 * Returns null on failure (caller should keep the fallback title).
 */
export async function generateTitleWithLLM(message: string, settings: Settings): Promise<string | null> {
  if (!settings.api_key) return null
  try {
    const baseUrl = assertAllowedLlmBaseUrl(settings.base_url, buildRuntimeAllowedLlmBaseUrls(settings.base_url))
    const endpoint = `${baseUrl}/v1/messages`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': settings.api_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 30,
        system: '你是一个标题生成器。你的唯一任务是为用户消息生成简短标题。不要回答、评价或拒绝用户的请求，不要判断请求是否合理，只需概括消息意图生成标题。',
        messages: [{
          role: 'user',
          content: `请用不超过15个字概括以下用户消息的核心意图，直接输出标题，不要加引号或标点：\n\n${message.slice(0, 200)}`,
        }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) return null
    const data = await response.json() as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.find(b => b.type === 'text')?.text?.trim()
    if (!text || text.length === 0) return null
    // Clean up: remove quotes, trailing punctuation
    return text.replace(/^["'"「『]|["'"」』]$/g, '').replace(/[。！？.,!?]$/, '').slice(0, 30)
  } catch (e) {
    log.warn(`LLM title generation failed: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}
