'use strict';

const path = require('path');
const { syncRegistryFromManifests } = require('./adapter-registry-sync.cjs');

const ADAPTERS_DIR = path.resolve(__dirname, '../../extension/adapters');
const sync = syncRegistryFromManifests(ADAPTERS_DIR);
console.log(`[sync-adapters-registry] Regenerated ${sync.registryPath} (${sync.adapterCount} adapters).`);
