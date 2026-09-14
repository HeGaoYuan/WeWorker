'use strict';

const fs = require('fs');
const path = require('path');
const { syncRegistryFromManifests } = require('./adapter-registry-sync.cjs');

const ADAPTERS_DIR = path.resolve(__dirname, '../../extension/adapters');
let stripped = 0;

for (const entry of fs.readdirSync(ADAPTERS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.resolve(ADAPTERS_DIR, entry.name, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Object.prototype.hasOwnProperty.call(manifest, 'quick_prompts')) continue;
  delete manifest.quick_prompts;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  stripped += 1;
}

const sync = syncRegistryFromManifests(ADAPTERS_DIR);
console.log(`[strip-quick-prompts] Removed quick_prompts from ${stripped} manifest(s).`);
console.log(`[strip-quick-prompts] Regenerated ${sync.registryPath} (${sync.adapterCount} adapters).`);
