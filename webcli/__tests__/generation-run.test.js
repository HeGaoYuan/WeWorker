import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERATION_STATUSES,
  GenerationBudgetExceededError,
  GenerationRun,
  GenerationRunStore,
} from '../generation-harness/index.js';

const tmpDirs = [];

function createStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-generation-run-'));
  tmpDirs.push(rootDir);
  return new GenerationRunStore({ rootDir });
}

afterEach(() => {
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('GenerationRun', () => {
  it('persists state transitions and redacted traces', () => {
    const store = createStore();
    const run = GenerationRun.create({
      store,
      siteKey: 'example.test',
      goal: 'generate query tools',
      input: { api_key: 'should-not-be-written', nested: { token: 'secret' } },
    });

    run.transition(GENERATION_STATUSES.CONTEXT_READY);
    run.transition(GENERATION_STATUSES.PLANNING);
    run.recordStep('inspect_generation_context', { authorization: 'Bearer secret' });

    const persisted = store.load(run.id);
    const trace = store.readTrace(run.id);
    expect(persisted.status).toBe(GENERATION_STATUSES.PLANNING);
    expect(persisted.input.api_key).toBe('[redacted]');
    expect(persisted.input.nested.token).toBe('[redacted]');
    expect(JSON.stringify(trace)).not.toContain('Bearer secret');
  });

  it('rejects invalid state transitions', () => {
    const run = GenerationRun.create({
      store: createStore(),
      siteKey: 'example.test',
      goal: 'generate query tools',
    });
    expect(() => run.transition(GENERATION_STATUSES.COMPLETED)).toThrow(/invalid generation state transition/);
  });

  it('enforces model-call budgets', () => {
    const run = GenerationRun.create({
      store: createStore(),
      siteKey: 'example.test',
      goal: 'generate query tools',
      budget: { maxModelCalls: 1 },
    });
    run.recordModelCall();
    expect(() => run.recordModelCall()).toThrow(GenerationBudgetExceededError);
  });
});
