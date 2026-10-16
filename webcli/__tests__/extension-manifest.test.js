import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const extensionDir = path.join(repoRoot, 'extension');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), 'utf8'));
}

function globToRegExp(glob) {
  const escaped = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchesAnyResource(resources, relPath) {
  return resources.some((pattern) => globToRegExp(pattern).test(relPath));
}

describe('extension manifest web accessible resources', () => {
  it('exposes generated adapter support files and optimization context files', () => {
    const manifest = readJson('extension/manifest.json');
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);

    expect(matchesAnyResource(resources, 'adapters/example.test/SKILL.md')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/SKILL.generated.md')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/WEBCLI_KNOWLEDGE.md')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/WEBCLI_KNOWLEDGE.json')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/webcli-generated/shared/example.test.runtime.generated.js')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/webcli-generated/example.generated.json')).toBe(true);
    expect(matchesAnyResource(resources, 'adapters/example.test/webcli-generated/tools/search_records.generated.js')).toBe(true);
  });

});
