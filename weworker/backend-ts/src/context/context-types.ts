export type ContextScope = 'runtime' | 'work' | 'long_term'
export type ContextSnapshotPhase = 'request_start' | 'turn_end'
export type ContextTokenSource = 'estimated' | 'provider_calibrated'

export interface ConversationCompactionSnapshot {
  mode: 'conversation_only'
  before_tokens: number
  after_tokens: number
  summarized_message_count: number
  retained_message_count: number
}

export type ContextCategoryId =
  | 'system_prompt'
  | 'tool_definitions'
  | 'rules'
  | 'skills'
  | 'mcp_dynamic_tools'
  | 'subagent_definitions'
  | 'conversation'
  | 'long_term_memory'

export interface ContextCategorySnapshot {
  id: ContextCategoryId
  scope: ContextScope
  estimated_tokens: number
  calibrated_tokens?: number
}

export interface ContextSnapshot {
  version: 1
  phase: ContextSnapshotPhase
  estimated_total_tokens: number
  context_limit: number
  categories: ContextCategorySnapshot[]
  actual_input_tokens?: number
  token_source?: ContextTokenSource
  displayed_total_tokens?: number
  compaction?: ConversationCompactionSnapshot
}

export interface RuntimeContext {
  system_prompt: string
  rules: string
  tool_definitions: string
  skills: string
  mcp_dynamic_tools: string
  subagent_definitions: string
}

export interface WorkContext {
  conversation: string
}

export interface LongTermMemoryContext {
  recalled: string
}

export interface ContextAssembly {
  runtime: RuntimeContext
  work: WorkContext
  long_term: LongTermMemoryContext
  sdk: {
    system_prompt: string
    prompt: string
  }
  snapshot: ContextSnapshot
}
