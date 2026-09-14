import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAdapterDraft } from '../generation-harness/index.js';

const tmpDirs = [];

function makeAdapter() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webcli-validator-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'webcli-generated'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), 'window.__webmcpRegister({ name: "test", tools: [] });\n');
  fs.writeFileSync(path.join(dir, 'webcli-generated', 'support.js'), 'window.support = true;\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    id: 'example.test',
    match: ['example.test'],
    support_files: ['webcli-generated/support.js'],
  }));
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('adapter draft static validator', () => {
  it('accepts a valid isolated adapter draft', () => {
    const adapterDir = makeAdapter();
    const result = validateAdapterDraft({
      adapterDir,
      expectedSiteKey: 'example.test',
      expectedToolNames: ['example.test.search_records'],
    });
    expect(result.passed).toBe(true);
  });

  it('rejects syntax errors and unsafe support paths', () => {
    const adapterDir = makeAdapter();
    fs.writeFileSync(path.join(adapterDir, 'index.js'), 'window.__webmcpRegister({');
    fs.writeFileSync(path.join(adapterDir, 'manifest.json'), JSON.stringify({
      id: 'example.test',
      match: ['example.test'],
      support_files: ['../outside.js'],
    }));
    const result = validateAdapterDraft({ adapterDir, expectedSiteKey: 'example.test' });
    expect(result.passed).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('INVALID_JAVASCRIPT');
    expect(result.errors.map((error) => error.code)).toContain('UNSAFE_SUPPORT_FILE_PATH');
  });
});
