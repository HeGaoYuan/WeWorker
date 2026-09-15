import { AsyncLocalStorage } from 'node:async_hooks'

export interface TurnExecutionContext {
  workId: string
  turnId: string
}

const storage = new AsyncLocalStorage<TurnExecutionContext>()

export function runWithTurnExecutionContext<T>(
  ctx: TurnExecutionContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn)
}

export function getTurnExecutionContext(): TurnExecutionContext | undefined {
  return storage.getStore()
}
