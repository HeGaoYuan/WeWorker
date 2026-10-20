import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createPackagedAdapterMatcher, injectPackagedAdapter } from '../background/packaged-adapter-loader.js';
import { v2CommandDefs } from '../background/v2-loader.js';

const manifest = {
  name: 'example.com', match: ['www.example.com'],
  commands: [
    { id: 'list', runtime: 'extension', module: 'extension/commands/list.js', safety: 'read' },
    { id: 'api', runtime: 'extension', module: 'extension/commands/api.js', safety: 'read' },
  ],
};
const files = {
  'extension/internal/helpers.js': 'window.__fixtureHelpers = true;',
  'extension/commands/list.js': '__webcliRegisterCommand("list", () => "listed");',
  'extension/commands/api.js': '__webcliRegisterCommand("api", () => "api");',
};
const paths = ['extension/internal/helpers.js', 'extension/commands/list.js', 'extension/commands/api.js'];
const bundle = { manifest, digest: 'a'.repeat(64), files };

function packagedReader(overrides = {}) {
  const reads = [];
  const read = async (path) => {
    reads.push(path);
    const rel = path.replace('managed-adapters/example.com/', '');
    return Object.hasOwn(overrides, rel) ? overrides[rel] : files[rel] ?? null;
  };
  return { read, reads };
}

test('a byte-identical packaged copy is used, checked once per digest', async () => {
  const { read, reads } = packagedReader();
  const match = createPackagedAdapterMatcher({ read });
  const expected = paths.map((path) => 'managed-adapters/example.com/' + path);
  assert.deepEqual(await match(bundle, paths), expected);
  assert.deepEqual(await match(bundle, paths), expected);
  assert.equal(reads.length, paths.length);
  // A new host digest is compared again.
  await match({ ...bundle, digest: 'b'.repeat(64) }, paths);
  assert.equal(reads.length, paths.length * 2);
});

test('any difference, missing file, read failure or unsafe path falls back to the debugger loader', async () => {
  const changed = createPackagedAdapterMatcher(packagedReader({ 'extension/commands/api.js': '__webcliRegisterCommand("api", () => "v2");' }));
  assert.equal(await changed(bundle, paths), null);
  const missing = createPackagedAdapterMatcher(packagedReader({ 'extension/internal/helpers.js': null }));
  assert.equal(await missing(bundle, paths), null);
  const failing = createPackagedAdapterMatcher({ read: async () => { throw new Error('not packaged'); } });
  assert.equal(await failing(bundle, paths), null);
  const reader = packagedReader();
  const guarded = createPackagedAdapterMatcher({ read: reader.read });
  assert.equal(await guarded({ ...bundle, manifest: { ...manifest, name: '../outside' } }, paths), null);
  assert.equal(await guarded({ ...bundle, files: { ...files, 'extension/commands/../x.js': 'x' } }, ['extension/commands/../x.js']), null);
  assert.equal(await guarded({ ...bundle, files: { ...files, 'manifest.json': '{}' } }, ['manifest.json']), null);
  assert.equal(await guarded(bundle, []), null);
  assert.equal(reader.reads.length, 0);
});

/** chrome.scripting fake that runs funcs and packaged files in one isolated world per document. */
function harness({ navigateAfterFiles = false, failFile = null, noDebugger = true } = {}) {
  const world = vm.createContext({});
  world.window = world;
  const registered = [];
  world.__webmcpRegister = (adapter) => registered.push(...adapter.tools.map((tool) => tool.name));
  let url = 'https://www.example.com/list';
  let documentId = 'doc-1';
  const calls = [];
  const api = {
    tabs: { get: async () => ({ id: 1, url }) },
    scripting: {
      executeScript: async (details) => {
        calls.push(details);
        if (details.target.documentIds && !details.target.documentIds.includes(documentId)) {
          throw new Error(`No document with id ${details.target.documentIds[0]} in tab 1`);
        }
        if (details.func) {
          const result = vm.runInContext('(' + details.func.toString() + ')(...' + JSON.stringify(details.args || []) + ')', world);
          return [{ frameId: 0, documentId, result: result === undefined ? undefined : JSON.parse(JSON.stringify(result)) }];
        }
        for (const file of details.files) {
          const rel = file.replace('managed-adapters/example.com/', '');
          try {
            if (rel === failFile) throw new Error('private fixture failure');
            vm.runInContext(files[rel], world);
          } catch { /* chrome.scripting reports a throwing file to the console and continues */ }
        }
        if (navigateAfterFiles) { url = 'https://www.example.com/other'; documentId = 'doc-2'; }
        return [{ frameId: 0, documentId }];
      },
    },
    ...(noDebugger ? {} : { debugger: {} }),
  };
  return { api, calls, registered, world };
}

const defs = v2CommandDefs(manifest);
const modules = { list: 'extension/commands/list.js', api: 'extension/commands/api.js' };
const packagedPaths = paths.map((path) => 'managed-adapters/example.com/' + path);

test('injects bootstrap then packaged files into the same document without chrome.debugger', async () => {
  const h = harness();
  const result = await injectPackagedAdapter({ tabId: 1, expectedUrl: 'https://www.example.com/list', defs, files: packagedPaths, modules, api: h.api });
  assert.deepEqual(result, { tabId: 1, documentId: 'doc-1', scriptCount: 4, packaged: true });
  assert.deepEqual(h.registered, ['example.com.list', 'example.com.api']);
  assert.equal(h.calls[0].world, 'ISOLATED');
  assert.ok(typeof h.calls[0].func === 'function');
  assert.deepEqual(h.calls[1].files, packagedPaths);
  assert.deepEqual(h.calls[1].target, { tabId: 1, documentIds: ['doc-1'] });
  assert.ok(h.calls.every((call) => call.world === 'ISOLATED'));
  assert.equal('debugger' in h.api, false);
});

test('a command file that throws is reported by its module path only', async () => {
  const h = harness({ failFile: 'extension/commands/api.js' });
  await assert.rejects(
    injectPackagedAdapter({ tabId: 1, defs, files: packagedPaths, modules, api: h.api }),
    { message: 'Adapter script failed: extension/commands/api.js' },
  );
});

test('a navigation during injection is a target change, so the host runtime can retry', async () => {
  const h = harness({ navigateAfterFiles: true });
  await assert.rejects(
    injectPackagedAdapter({ tabId: 1, defs, files: packagedPaths, modules, api: h.api }),
    /Adapter target changed during loading/,
  );
  const moved = harness();
  await assert.rejects(
    injectPackagedAdapter({ tabId: 1, expectedUrl: 'https://www.example.com/elsewhere', defs, files: packagedPaths, api: moved.api }),
    /target changed or is unsupported/,
  );
  assert.equal(moved.calls.length, 0);
});
