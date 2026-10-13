export type ThinkingEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const THINKING_EFFORTS = new Set<ThinkingEffort>(['low', 'medium', 'high', 'xhigh', 'max'])

export function resolveThinkingEffort(providerId: string | undefined, model: string | undefined, requested: unknown): ThinkingEffort {
  const candidate = THINKING_EFFORTS.has(String(requested) as ThinkingEffort)
    ? String(requested) as ThinkingEffort
    : 'medium'
  const modelName = String(model || '')
  const supportsExtendedEffort = providerId === 'anthropic'
    && /(?:claude-(?:opus|sonnet)-4[.-]6|claude-(?:opus|sonnet)-4[.-]7|fable)/i.test(modelName)
  return supportsExtendedEffort || candidate === 'low' || candidate === 'medium' || candidate === 'high'
    ? candidate
    : 'high'
}
