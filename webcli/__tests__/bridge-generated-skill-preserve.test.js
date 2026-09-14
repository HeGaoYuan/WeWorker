import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('bridge AI adapter generation compatibility', () => {
  it('preserves existing adapter-local SKILL.md in legacy AI generation path', () => {
    const source = readText('webcli/bridge.js');

    expect(source).toContain("const skillPath = path.join(adapterDir, 'SKILL.md')");
    expect(source).toContain('fs.existsSync(skillPath)');
    expect(source).toContain('preserving adapter-local file');
    expect(source).toContain('generateSkillMd({ siteKey, adapterCode, toolNames })');
  });

  it('restricts extension adapter writes to generated adapter artifacts', () => {
    const source = readText('webcli/bridge.js');

    expect(source).toContain('ADAPTER_ROOT_WRITABLE_FILES');
    expect(source).toContain("'SKILL.md'");
    expect(source).toContain("'SKILL.generated.md'");
    expect(source).toContain("'WEBCLI_KNOWLEDGE.md'");
    expect(source).toContain("'WEBCLI_KNOWLEDGE.json'");
    expect(source).toContain('GENERATED_WRITABLE_FILE_RE');
    expect(source).toContain('Adapter file is not writable from extension');
  });
});
