import type { ProviderEntry } from './llm-egress.js'
import { buildAnthropicAuthHeaders } from './anthropic-auth.js'
import type { AnthropicAuthType } from './anthropic-auth.js'

export type ModelCatalogSource = 'remote' | 'fallback'
export type ProbeTarget = 'weworker' | 'webwright'
export type ProbeErrorCode =
  | 'not_configured'
  | 'auth_failed'
  | 'model_unavailable'
  | 'rate_limited'
  | 'endpoint_missing'
  | 'protocol_mismatch'
  | 'network_error'
  | 'timeout'
  | 'service_unavailable'

export interface ProviderAccessInput {
  provider: ProviderEntry
  apiKey: string
  anthropicBaseUrl?: string
  openaiBaseUrl?: string
  anthropicAuthType?: AnthropicAuthType
}

export interface ProviderConnectionInput extends ProviderAccessInput {
  model: string
}

export interface ModelCatalogResult {
  models: string[]
  source: ModelCatalogSource
  warning?: string
}

export interface ProtocolProbeResult {
  ok: boolean
  target: ProbeTarget
  protocol: 'anthropic_messages' | 'openai_chat_completions'
  model: string
  error?: ProbeErrorCode
  detail?: string
  auth_type?: AnthropicAuthType
}

type FetchLike = typeof fetch
type ProviderProtocolProbeInput = ProviderConnectionInput & {
  target: ProbeTarget
  verifyResponse?: boolean
  forceAnthropicTextProbe?: boolean
}

function uniqueModels(values: unknown[]): string[] {
  return [...new Set(values
    .map(value => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean))]
}

function formatRemoteResponse(response: Response, body: string): string {
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  return `${status}\n${body || '（空响应体）'}`
}

async function readRemoteResponse(response: Response): Promise<{ body: string; detail: string }> {
  const body = await response.text()
  return { body, detail: formatRemoteResponse(response, body) }
}

function parseModelList(body: string, detail: string): string[] {
  try {
    const data = JSON.parse(body) as { data?: Array<{ id?: unknown }> }
    if (!Array.isArray(data.data)) throw new Error('模型列表响应格式无效')
    return uniqueModels(data.data.map(item => item.id))
  } catch (error) {
    const reason = error instanceof SyntaxError ? '模型列表响应不是有效 JSON' : '模型列表响应格式无效'
    throw new Error(`${reason}\n${detail}`)
  }
}

async function fetchAnthropicModels(baseUrl: string, apiKey: string, providerId: string, authType: AnthropicAuthType | undefined, fetchImpl: FetchLike): Promise<string[]> {
  const response = await fetchImpl(`${baseUrl}/v1/models?limit=1000`, {
    headers: {
      ...buildAnthropicAuthHeaders(apiKey, providerId, authType),
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(15000),
  })
  const remote = await readRemoteResponse(response)
  if (!response.ok) throw new Error(remote.detail)
  return parseModelList(remote.body, remote.detail)
}

async function fetchOpenAiModels(baseUrl: string, apiKey: string, fetchImpl: FetchLike): Promise<string[]> {
  const response = await fetchImpl(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  const remote = await readRemoteResponse(response)
  if (!response.ok) throw new Error(remote.detail)
  return parseModelList(remote.body, remote.detail)
}

export async function listProviderModels(
  input: ProviderAccessInput,
  fetchImpl: FetchLike = fetch,
): Promise<ModelCatalogResult> {
  if (!input.apiKey) {
    return { models: [...input.provider.models], source: 'fallback', warning: '未配置 API Key，显示内置模型列表' }
  }

  const requests: Array<{ label: string; promise: Promise<string[]> }> = []
  if (input.provider.id === 'custom') {
    if (input.anthropicBaseUrl) requests.push({ label: 'Anthropic 接口', promise: fetchAnthropicModels(input.anthropicBaseUrl, input.apiKey, input.provider.id, input.anthropicAuthType, fetchImpl) })
    if (input.openaiBaseUrl) requests.push({ label: 'OpenAI 接口', promise: fetchOpenAiModels(input.openaiBaseUrl, input.apiKey, fetchImpl) })
  } else if (input.provider.webwright.protocol === 'openai_chat_completions') {
    requests.push({ label: 'OpenAI 接口', promise: fetchOpenAiModels(input.provider.webwright.baseUrl, input.apiKey, fetchImpl) })
  } else {
    requests.push({ label: 'Anthropic 接口', promise: fetchAnthropicModels(input.provider.weworker.baseUrl, input.apiKey, input.provider.id, input.anthropicAuthType, fetchImpl) })
  }

  if (requests.length === 0) {
    return { models: [...input.provider.models], source: 'fallback', warning: '模型列表接口未配置，显示内置模型列表' }
  }

  const results = await Promise.allSettled(requests.map(request => request.promise))
  const succeeded = results.filter((result): result is PromiseFulfilledResult<string[]> => result.status === 'fulfilled')
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${requests[index].label}：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
    : [])
  if (succeeded.length > 0) {
    return {
      models: uniqueModels(succeeded.flatMap(result => result.value)),
      source: 'remote',
      ...(failures.length > 0 ? { warning: failures.join('\n\n') } : {}),
    }
  }

  return { models: [...input.provider.models], source: 'fallback', warning: failures.join('\n\n') || '远程模型列表获取失败' }
}

function classifyProbeFailure(status: number, detail: string): ProbeErrorCode {
  if (status === 401 || status === 403) return 'auth_failed'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'service_unavailable'
  if (/model/i.test(detail) && (status === 400 || status === 404)) return 'model_unavailable'
  if (status === 404) return 'endpoint_missing'
  return 'protocol_mismatch'
}

function shouldProbeWithAnthropicToolChoice(input: ProviderConnectionInput & { target: ProbeTarget; verifyResponse?: boolean }): boolean {
  if (!input.verifyResponse || input.target !== 'weworker') return false
  // DeepSeek's Anthropic-compatible endpoint rejects forced tool_choice when
  // thinking/reasoning mode is active. Use a plain JSON text probe for this
  // provider so the settings connection check does not fail before chat starts.
  if (input.provider.id === 'deepseek') return false
  return input.provider.weworker.protocol === 'anthropic_messages'
}

function shouldRetryAnthropicTextProbe(input: ProviderProtocolProbeInput, detail: string): boolean {
  if (input.forceAnthropicTextProbe) return false
  if (input.provider.id !== 'custom') return false
  if (!shouldProbeWithAnthropicToolChoice(input)) return false
  return /\btool_choice\b|\btool choice\b|\btools?\b|\bthinking\b|\breasoning\b/i.test(detail)
}

export async function probeProviderProtocol(
  input: ProviderProtocolProbeInput,
  fetchImpl: FetchLike = fetch,
): Promise<ProtocolProbeResult> {
  const config = input.target === 'weworker' ? input.provider.weworker : input.provider.webwright
  const protocol = config.protocol
  const baseUrl = input.provider.id === 'custom'
    ? (protocol === 'anthropic_messages' ? input.anthropicBaseUrl : input.openaiBaseUrl)
    : config.baseUrl
  if (!input.apiKey || !input.model || !baseUrl) {
    return { ok: false, target: input.target, protocol, model: input.model, error: 'not_configured', detail: 'API Key、模型或 Base URL 未配置完整' }
  }

  const isAnthropic = protocol === 'anthropic_messages'
  const endpoint = `${baseUrl}${isAnthropic ? '/v1/messages' : '/chat/completions'}`
  const headers: Record<string, string> = isAnthropic
    ? { ...buildAnthropicAuthHeaders(input.apiKey, input.provider.id, input.anthropicAuthType), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
    : { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' }
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
  const useAnthropicToolProbe = isAnthropic && !input.forceAnthropicTextProbe && shouldProbeWithAnthropicToolChoice(input)
  const body = isAnthropic
    ? {
        model: input.model,
        max_tokens: input.verifyResponse ? 256 : 20,
        messages: [{ role: 'user', content: 'Return {"ok":true}.' }],
        ...(useAnthropicToolProbe ? {
          tools: [{ name: 'connection_check', description: 'Confirm the connection without performing any action.', input_schema: schema }],
          tool_choice: { type: 'tool', name: 'connection_check' },
        } : {}),
        ...(input.target === 'webwright' ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
      }
    : {
        model: input.model,
        max_tokens: input.verifyResponse ? 256 : 20,
        messages: [{ role: 'user', content: 'Return JSON: {"ok":true}.' }],
        response_format: { type: 'json_object' },
      }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    })
    if (response.ok) {
      if (input.verifyResponse) {
        try {
          const data = await response.json() as any
          if (useAnthropicToolProbe) {
            if (!data.content?.some((block: any) => block.type === 'tool_use' && block.name === 'connection_check' && block.input?.ok === true)) throw new Error()
          } else {
            const content = isAnthropic
              ? data.content?.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('')
              : data.choices?.[0]?.message?.content
            if (JSON.parse(content).ok !== true) throw new Error()
          }
        } catch {
          return {
            ok: false,
            target: input.target,
            protocol,
            model: input.model,
            error: 'protocol_mismatch',
            detail: useAnthropicToolProbe ? '服务未返回有效的工具调用，请确认此模型支持 Claude Code' : '服务未返回有效的结构化 JSON，请检查接口地址和模型能力',
          }
        }
      }
      return { ok: true, target: input.target, protocol, model: input.model }
    }
    const detail = (await readRemoteResponse(response)).detail.split(input.apiKey).join('[已隐藏]')
    if (isAnthropic && shouldRetryAnthropicTextProbe(input, detail)) {
      return probeProviderProtocol({ ...input, forceAnthropicTextProbe: true }, fetchImpl)
    }
    return { ok: false, target: input.target, protocol, model: input.model, error: classifyProbeFailure(response.status, detail), detail }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      target: input.target,
      protocol,
      model: input.model,
      error: timedOut ? 'timeout' : 'network_error',
      detail: timedOut ? '连接超时' : (error instanceof Error ? error.message : '连接失败').split(input.apiKey).join('[已隐藏]'),
    }
  }
}

export async function probeMainConnection(input: ProviderConnectionInput & { autoAuth?: boolean }, fetchImpl: FetchLike = fetch): Promise<ProtocolProbeResult> {
  const authType = input.anthropicAuthType || 'auth_token'
  const result = await probeProviderProtocol({ ...input, target: 'weworker', verifyResponse: true }, fetchImpl)
  if (input.provider.id !== 'custom') return result
  if (result.ok) return { ...result, auth_type: authType }
  if (!input.autoAuth || result.error !== 'auth_failed') return result
  const alternate = authType === 'auth_token' ? 'api_key' : 'auth_token'
  const retried = await probeProviderProtocol({ ...input, anthropicAuthType: alternate, target: 'weworker', verifyResponse: true }, fetchImpl)
  return retried.ok ? { ...retried, auth_type: alternate } : retried
}
