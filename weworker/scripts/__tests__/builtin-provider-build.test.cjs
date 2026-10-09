const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');
const { mergeBuildProfile } = require('../build-profile-overlay.cjs');
const { validateBuildProfile } = require('../build-profile-validator.cjs');
const { createEsbuildDefines } = require('../bundle-backend-ts.cjs');
const root = path.resolve(__dirname, '../..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'build-profile.json'), 'utf8'));

function registryFor(profile) {
  const built = buildSync({ entryPoints: [path.join(root, 'backend-ts/src/provider-registry.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
    define: createEsbuildDefines(profile),
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test('public profile and compiled backend expose identical credential-free built-in metadata', () => {
  validateBuildProfile(profile);
  const runtime = registryFor(profile);
  const builtin = profile.providers.find(p => p.id === 'builtin');
  const builtinDev = profile.providers.find(p => p.id === 'builtin_dev');
  assert.ok(builtin);
  assert.ok(builtinDev);
  assert.deepEqual(runtime.getProvider('builtin'), builtin);
  assert.deepEqual(runtime.getProvider('builtin_dev'), builtinDev);
  assert.equal(builtinDev.weworker.baseUrl, '');
  const defines = createEsbuildDefines(profile);
  assert.deepEqual(JSON.parse(defines.__BUILD_PROVIDERS__), profile.providers);
  assert.doesNotMatch(JSON.stringify(profile.providers), /api_key|apiKey|token|secret/i);
});

test('overlay can replace a managed provider endpoint without runtime reinsertion', () => {
  const builtin = profile.providers.find(p => p.id === 'builtin');
  const managed = { ...builtin, id: 'builtin_dev', name: 'Fixture managed provider',
    weworker: { ...builtin.weworker, baseUrl: 'https://example.com/anthropic' },
    webwright: { ...builtin.webwright, baseUrl: 'https://example.com/v1' },
  };
  const effective = mergeBuildProfile(profile, { providers: { remove: ['builtin'], upsert: [managed] }, defaultProvider: 'builtin_dev' });
  validateBuildProfile(effective);
  const runtime = registryFor(effective);
  assert.equal(runtime.getProvider('builtin'), undefined);
  assert.deepEqual(runtime.getProvider('builtin_dev'), managed);
  assert.ok(runtime.ALLOWED_LLM_BASE_URLS.has('https://example.com/v1'));
});
