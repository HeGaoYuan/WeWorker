export const CONTEXT_CATEGORY_META = {
  system_prompt: { label: '系统提示词', color: '#7f8791', scope: 'runtime' },
  tool_definitions: { label: '工具定义', color: '#7456d8', scope: 'runtime' },
  rules: { label: '全局规则', color: '#168a68', scope: 'runtime' },
  skills: { label: 'Skills 索引', color: '#c17e20', scope: 'runtime' },
  mcp_dynamic_tools: { label: 'MCP 与动态工具', color: '#b9438a', scope: 'runtime' },
  subagent_definitions: { label: 'Agent 定义', color: '#3689c9', scope: 'runtime' },
  conversation: { label: '当前对话', color: '#df6c45', scope: 'work' },
  long_term_memory: { label: '长期记忆', color: '#5d8f57', scope: 'long_term' },
}

export const CONTEXT_SCOPE_LABELS = {
  runtime: '固定运行上下文',
  work: '当前任务上下文',
  long_term: '长期上下文',
}

export function normalizeContextSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const categories = Array.isArray(snapshot.categories)
    ? snapshot.categories
      .filter((item) => item && CONTEXT_CATEGORY_META[item.id])
      .map((item) => ({
        id: item.id,
        scope: item.scope || CONTEXT_CATEGORY_META[item.id].scope,
        estimated_tokens: Math.max(0, Number(item.estimated_tokens) || 0),
      }))
    : []
  const estimatedTotal = Math.max(0, Number(snapshot.estimated_total_tokens) || 0)
  const contextLimit = Math.max(1, Number(snapshot.context_limit) || 1000000)
  return {
    version: 1,
    phase: snapshot.phase === 'turn_end' ? 'turn_end' : 'request_start',
    estimated_total_tokens: estimatedTotal,
    context_limit: contextLimit,
    actual_input_tokens: Number.isFinite(Number(snapshot.actual_input_tokens))
      ? Math.max(0, Number(snapshot.actual_input_tokens))
      : null,
    categories,
  }
}

export function formatContextTokens(value) {
  const tokens = Math.max(0, Number(value) || 0)
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(tokens >= 10000000 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10000 ? 1 : 2).replace(/\.0$/, '')}K`
  return String(Math.round(tokens))
}

export function contextUsagePercent(snapshot) {
  if (!snapshot) return 0
  return Math.min(100, Math.max(0, (snapshot.estimated_total_tokens / snapshot.context_limit) * 100))
}
