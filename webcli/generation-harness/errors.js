export class GenerationHarnessError extends Error {
  constructor(message, code = 'GENERATION_HARNESS_ERROR', details = undefined) {
    super(message);
    this.name = 'GenerationHarnessError';
    this.code = code;
    this.details = details;
  }
}

export class GenerationBudgetExceededError extends GenerationHarnessError {
  constructor(metric, limit, actual) {
    super(
      `generation budget exceeded: ${metric}=${actual}, limit=${limit}`,
      'GENERATION_BUDGET_EXCEEDED',
      { metric, limit, actual },
    );
    this.name = 'GenerationBudgetExceededError';
  }
}

export class GenerationCancelledError extends GenerationHarnessError {
  constructor(message = 'generation run cancelled') {
    super(message, 'GENERATION_CANCELLED');
    this.name = 'GenerationCancelledError';
  }
}

export function isAbortLikeError(error) {
  return error?.name === 'AbortError'
    || error instanceof GenerationCancelledError
    || error?.code === 'GENERATION_CANCELLED';
}
