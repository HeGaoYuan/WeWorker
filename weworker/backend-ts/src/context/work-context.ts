import type { WorkContext } from './context-types.js'

export function createWorkContext(input: { conversation?: string } = {}): WorkContext {
  return { conversation: input.conversation ?? '' }
}
