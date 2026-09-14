import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATION_STATUSES,
  GenerationHarness,
  GenerationRunStore,
  createAdapterGenerationWorkflow,
} from '../generation-harness/index.js';

const tmpDirs = [];

function createStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-adapter-workflow-'));
  tmpDirs.push(rootDir);
  return new GenerationRunStore({ rootDir });
}

afterEach(() => {
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('adapter generation workflow', () => {
  it('plans, drafts and statically validates in an isolated run directory', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        type: 'tool_call',
        name: 'inspect_generation_context',
        arguments: { section: 'overview' },
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        name: 'inspect_generation_context',
        arguments: { section: 'list_apis' },
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        name: 'save_generation_plan',
        arguments: {
          summary: '生成房间查询工具',
          strategy: 'api_first',
          tools: [{
            name: 'query_rooms',
            purpose: '查询房间',
            risk: 'read',
            sourceApiIndexes: [0],
          }],
        },
      })
      .mockResolvedValueOnce({ type: 'final', content: 'plan saved' });

    const adaptersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-workflow-adapters-'));
    tmpDirs.push(adaptersDir);
    const harness = new GenerationHarness({
      store: createStore(),
      workflow: createAdapterGenerationWorkflow({
        model,
        adaptersDir,
      }),
    });
    const started = harness.start({
      siteKey: 'example.test',
      goal: 'generate query tools',
      input: {
        memory: {
          siteKey: 'example.test',
          siteHost: 'example.test',
          siteOrigin: 'https://example.test',
          canonicalEntryUrl: 'https://example.test/app',
          updatedAt: '2026-07-22T00:00:00.000Z',
          firstCapturedAt: '2026-07-22T00:00:00.000Z',
          captureCount: 1,
          workflowVersion: 'test-v1',
          workflowVersionsSeen: ['test-v1'],
          lastSourceUrl: 'https://example.test/app',
          canonicalResultUrl: 'https://example.test/app',
          verdictPattern: 'api_driven',
          recommendedStrategy: 'api_first',
          verdictReason: 'Found a reusable room list API.',
          search: {},
          listApiCandidates: [{
            method: 'GET',
            url: 'https://example.test/api/rooms?page=1',
            responsePreview: JSON.stringify({ data: { list: [{ id: 'r1', name: 'Room 1' }] } }),
          }],
          actionApiCandidates: [],
          actionCaptureHistory: [],
          resultSignals: {},
          detailHints: { mode: '', bestCandidateHref: '', bestCandidateText: '', networkDetailCandidates: [] },
          pagination: {
            attempted: false,
            verified: false,
            mode: '',
            targetPage: null,
            activePageBefore: null,
            activePageAfter: null,
            reason: '',
          },
        },
      },
    });
    const result = await harness.wait(started.id);

    expect(result.status).toBe(GENERATION_STATUSES.AWAITING_APPROVAL);
    expect(result.result.pause).toBe(true);
    expect(result.artifacts.staticValidation.passed).toBe(true);
    expect(result.artifacts.draft.adapterDir).toContain(started.id);
    expect(result.artifacts.draft.toolNames).toContain('example.test.query_rooms');
    expect(result.artifacts.draft.semanticEnhancement.analysisSource).toBe('harness_plan');
    expect(result.modelCallCount).toBe(4);
    expect(fs.existsSync(result.artifacts.draft.files.manifest)).toBe(true);
  });

  it('feeds runtime validation failures back into the revision loop', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({ type: 'tool_call', name: 'inspect_generation_context', arguments: { section: 'overview' } })
      .mockResolvedValueOnce({ type: 'tool_call', name: 'inspect_generation_context', arguments: { section: 'list_apis' } })
      .mockResolvedValueOnce({
        type: 'tool_call',
        name: 'save_generation_plan',
        arguments: {
          summary: '生成查询工具',
          strategy: 'api_first',
          tools: [{ name: 'runtime.test.search_records', purpose: '查询记录', risk: 'read', sourceApiIndexes: [0] }],
        },
      })
      .mockResolvedValueOnce({ type: 'final', content: 'plan saved' })
      .mockResolvedValueOnce({ type: 'tool_call', name: 'inspect_validation_errors', arguments: {} })
      .mockResolvedValueOnce({ type: 'tool_call', name: 'validate_adapter_draft', arguments: {} })
      .mockResolvedValueOnce({ type: 'final', content: 'runtime issue reviewed' });
    const runtimeValidator = vi.fn()
      .mockResolvedValueOnce({
        passed: false,
        validator: 'adapter_runtime_validator_v1',
        errors: [{ code: 'OUTPUT_CONTRACT_MISMATCH', toolName: 'runtime.test.search_records', message: 'items missing' }],
        toolResults: [],
      })
      .mockResolvedValueOnce({
        passed: true,
        validator: 'adapter_runtime_validator_v1',
        errors: [],
        toolResults: [{ toolName: 'runtime.test.search_records', attempted: true, passed: true }],
      });
    const adaptersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-runtime-repair-adapters-'));
    tmpDirs.push(adaptersDir);
    const harness = new GenerationHarness({
      store: createStore(),
      workflow: createAdapterGenerationWorkflow({
        model,
        adaptersDir,
        runtimeValidator,
      }),
    });
    const started = harness.start({
      siteKey: 'runtime.test',
      goal: 'generate and runtime validate query tools',
      input: {
        memory: {
          siteKey: 'runtime.test',
          siteHost: 'runtime.test',
          siteOrigin: 'https://runtime.test',
          canonicalEntryUrl: 'https://runtime.test/app',
          canonicalResultUrl: 'https://runtime.test/app',
          lastSourceUrl: 'https://runtime.test/app',
          updatedAt: '2026-07-22T00:00:00.000Z',
          firstCapturedAt: '2026-07-22T00:00:00.000Z',
          captureCount: 1,
          workflowVersion: 'test-v1',
          workflowVersionsSeen: ['test-v1'],
          verdictPattern: 'api_driven',
          recommendedStrategy: 'api_first',
          verdictReason: 'Found a reusable API.',
          search: {},
          listApiCandidates: [{
            method: 'GET',
            url: 'https://runtime.test/api/items?page=1',
            responsePreview: JSON.stringify({ data: { list: [{ id: '1' }] } }),
          }],
          actionApiCandidates: [],
          actionCaptureHistory: [],
          resultSignals: {},
          detailHints: { mode: '', bestCandidateHref: '', bestCandidateText: '', networkDetailCandidates: [] },
          pagination: { attempted: false, verified: false, mode: '', targetPage: null, activePageBefore: null, activePageAfter: null, reason: '' },
        },
      },
    });
    const result = await harness.wait(started.id);

    expect(result.status).toBe(GENERATION_STATUSES.AWAITING_APPROVAL);
    expect(result.revisionCount).toBe(1);
    expect(runtimeValidator).toHaveBeenCalledTimes(2);
    expect(result.artifacts.runtimeValidation.passed).toBe(true);
  });
});
