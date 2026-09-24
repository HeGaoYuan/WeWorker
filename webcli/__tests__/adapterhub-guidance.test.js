import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readAdapterPackage } from '../adapterhub-package-v2.js';

const manifest = {
  schema_version: 2, name: 'demo.example.com', version: '1.0.0', description: 'Demo',
  match: ['example.com'], commands: [{ id: 'list', runtime: 'extension',
    module: 'extension/commands/list.js', description: 'List items', schema: { type: 'object', properties: {} } }],
};

function archive(guidanceName, guidance) {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'extension/commands/list.js': strToU8('fixture'),
    [guidanceName]: strToU8(guidance),
  });
}

describe('v2 .adapt guidance', () => {
  it('retains package guidance and checks its root and content', () => {
    const pkg = readAdapterPackage(archive('guidance.md', '## Workflow\n\nSearch first.\n'));
    expect(pkg.files.get('guidance.md').toString('utf8')).toContain('Search first.');
    expect(() => readAdapterPackage(archive('notes/guidance.md', 'Search first.'))).toThrow(/Unexpected package root/);
    expect(() => readAdapterPackage(archive('guidance.md', '---\nname: override\n---\n'))).toThrow(/Skill frontmatter/);
  });
});
