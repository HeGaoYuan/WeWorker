import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractHelp(source) {
  const match = source.match(/const HELP\s*=\s*`([\s\S]*?)`\.trim\(\)/);
  return match ? match[1] : '';
}

describe('adapter knowledge command', () => {
  it('is exposed in the top-level webcli help', () => {
    const help = extractHelp(readText('webcli/index.js'));
    expect(help).toContain('adapter knowledge <id>');
    expect(help).toContain('WEBCLI_KNOWLEDGE.md');
    expect(help).toContain('WEBCLI_KNOWLEDGE.json');
    expect(help).toContain('adapter skill <id> --generated');
    expect(help).toContain('adapter skill <id> --regenerate --overwrite');
  });

  it('is implemented and documented in adapter CLI help', () => {
    const source = readText('webcli/adapter-cli.js');
    expect(source).toContain('case "knowledge"');
    expect(source).toContain('async function cmdKnowledge');
    expect(source).toContain('webcli adapter knowledge <id>');
    expect(source).toContain('WEBCLI_KNOWLEDGE.md');
    expect(source).toContain('WEBCLI_KNOWLEDGE.json');
    expect(source).toContain('--generated');
    expect(source).toContain('--overwrite');
    expect(source).toContain('SKILL.generated.md');
    expect(source).toContain('isGeneratedAdapterManifest');
  });
});
