import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATION_STATUSES,
  GenerationRun,
  GenerationRunStore,
  reviseAdapterDraft,
  validateAdapterDraft,
} from '../generation-harness/index.js';

const tmpDirs = [];

function makeTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('adapter draft revision loop', () => {
  it('lets the model repair only files inside an isolated draft and revalidates deterministically', async () => {
    const store = new GenerationRunStore({ rootDir: makeTmpDir('webcli-revision-store-') });
    const previousRoot = makeTmpDir('webcli-revision-source-');
    const adapterDir = path.join(previousRoot, 'example.test');
    fs.mkdirSync(adapterDir, { recursive: true });
    fs.writeFileSync(path.join(adapterDir, 'index.js'), 'window.__webmcpRegister({');
    fs.writeFileSync(path.join(adapterDir, 'manifest.json'), JSON.stringify({
      id: 'example.test',
      match: ['example.test'],
      support_files: [],
    }));

    const run = GenerationRun.create({ store, siteKey: 'example.test', goal: 'repair draft' });
    run.transition(GENERATION_STATUSES.CONTEXT_READY);
    run.transition(GENERATION_STATUSES.PLANNING);
    run.transition(GENERATION_STATUSES.DRAFTING);
    run.transition(GENERATION_STATUSES.STATIC_VALIDATING);
    const initialValidation = validateAdapterDraft({ adapterDir, expectedSiteKey: 'example.test' });
    expect(initialValidation.passed).toBe(false);

    const model = vi.fn()
      .mockResolvedValueOnce({ type: 'tool_call', name: 'inspect_validation_errors', arguments: {} })
      .mockResolvedValueOnce({ type: 'tool_call', name: 'read_draft_file', arguments: { path: 'index.js' } })
      .mockResolvedValueOnce({
        type: 'tool_call',
        name: 'write_draft_file',
        arguments: {
          path: 'index.js',
          content: 'window.__webmcpRegister({ name: "test", tools: [] });\n',
          reason: '修复未闭合的对象字面量',
        },
      })
      .mockResolvedValueOnce({ type: 'tool_call', name: 'validate_adapter_draft', arguments: {} })
      .mockResolvedValueOnce({ type: 'final', content: 'validation passed' });

    const revised = await reviseAdapterDraft({
      run,
      signal: new AbortController().signal,
      store,
      model,
      draft: {
        revision: 0,
        rootDir: previousRoot,
        adapterDir,
        toolNames: ['example.test.search_records'],
      },
      validation: initialValidation,
      staticValidator: validateAdapterDraft,
    });

    expect(revised.validation.passed).toBe(true);
    expect(revised.draft.revision).toBe(1);
    expect(revised.writes).toEqual([{ path: 'index.js', reason: '修复未闭合的对象字面量' }]);
    expect(fs.readFileSync(path.join(revised.draft.adapterDir, 'index.js'), 'utf8')).toContain('__webmcpRegister');
    expect(fs.readFileSync(path.join(adapterDir, 'index.js'), 'utf8')).toBe('window.__webmcpRegister({');
  });
});
