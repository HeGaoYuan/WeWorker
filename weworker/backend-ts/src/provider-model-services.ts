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
}

type FetchLike = typeof fetch

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
  if (/model/i.test(detail) && (status === 400 || status === 404)) return 'model_unavailable'
  if (status === 404) return 'endpoint_missing'
  return 'protocol_mismatch'
}

export async function probeProviderProtocol(
  input: ProviderConnectionInput & { target: ProbeTarget },
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
  const body = isAnthropic
    ? {
        model: input.model,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Return {"ok":true}.' }],
        ...(input.target === 'webwright' ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
      }
    : {
        model: input.model,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Return JSON: {"ok":true}.' }],
        response_format: { type: 'json_object' },
      }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (response.ok) return { ok: true, target: input.target, protocol, model: input.model }
    const detail = (await readRemoteResponse(response)).detail
    return { ok: false, target: input.target, protocol, model: input.model, error: classifyProbeFailure(response.status, detail), detail }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      target: input.target,
      protocol,
      model: input.model,
      error: timedOut ? 'timeout' : 'network_error',
      detail: timedOut ? '连接超时' : (error instanceof Error ? error.message : '连接失败'),
    }
  }
}
