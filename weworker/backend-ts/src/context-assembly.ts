import { assembleContext } from './context/context-assembler.js'
import { createLongTermMemoryContext } from './context/long-term-context.js'
import { createRuntimeContext } from './context/runtime-context.js'
import { createWorkContext } from './context/work-context.js'
import type { ConversationCompactionSnapshot } from './context/context-types.js'

export type {
  ContextAssembly,
  ContextCategoryId,
  ContextCategorySnapshot,
  ContextSnapshot,
  ConversationCompactionSnapshot,
  ContextSnapshotPhase,
  LongTermMemoryContext,
  RuntimeContext,
  WorkContext,
} from './context/context-types.js'
export {
  assembleContext,
  buildTurnEndContextSnapshot,
  createTurnContextCollector,
  estimateContextTokens,
} from './context/context-assembler.js'
export { createLongTermMemoryContext, recallLongTermMemory } from './context/long-term-context.js'
export { buildEnabledSkillIndex, createRuntimeContext, splitSystemPromptForContext } from './context/runtime-context.js'
export { createWorkContext } from './context/work-context.js'

export function buildContextAssembly(input: {
  systemPrompt: string
  identityPrompt: string
  prompt: string
  toolDefinitions?: string
  skillIndex?: string
  loadedSkills?: string
  mcpDynamicTools?: string
  subagentDefinitions?: string
  recalledMemory?: string
  contextLimit?: number
  compaction?: ConversationCompactionSnapshot
}) {
  return assembleContext({
    runtime: createRuntimeContext(input),
    work: createWorkContext({ conversation: input.prompt }),
    longTerm: createLongTermMemoryContext({ recalledMemory: input.recalledMemory }),
    sdkSystemPrompt: input.systemPrompt,
    sdkPrompt: input.loadedSkills ? `${input.loadedSkills}\n\n${input.prompt}` : input.prompt,
    contextLimit: input.contextLimit,
    compaction: input.compaction,
  })
}
