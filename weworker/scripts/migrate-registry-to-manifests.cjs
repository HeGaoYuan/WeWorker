'use strict';

const path = require('path');
const {
  migrateRegistryMetadataToManifests,
  syncRegistryFromManifests,
} = require('./adapter-registry-sync.cjs');

const ADAPTERS_DIR = path.resolve(__dirname, '../../extension/adapters');

const migration = migrateRegistryMetadataToManifests(ADAPTERS_DIR);
console.log(`[migrate-registry-to-manifests] Updated ${migration.updated}/${migration.total} manifest(s).`);

const sync = syncRegistryFromManifests(ADAPTERS_DIR);
console.log(`[migrate-registry-to-manifests] Regenerated ${sync.registryPath} (${sync.adapterCount} adapters).`);
