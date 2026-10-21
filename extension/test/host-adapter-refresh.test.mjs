import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapterRuntime } from '../background/host-adapter-runtime.js';

test('refresh waits for a running command and later calls wait for refresh without replay', async () => {
  const order = []; let finishCall, finishRefresh;
  const runtime = createHostAdapterRuntime({ bundle: async () => [], prepare: async () => {}, clear: async () => {}, inject: async () => {} });
  const manifest = { name: 'example.com', _hostSnapshot: { digest: 'example-digest' } };
  const first = runtime.execute(7, manifest, 'https://example.com', async () => { order.push('call-start'); await new Promise(resolve => finishCall = resolve); order.push('call-end'); });
  while (!finishCall) await new Promise(resolve => setImmediate(resolve));
  const refresh = runtime.exclusive(7, async () => { order.push('refresh-start'); await new Promise(resolve => finishRefresh = resolve); runtime.invalidate(7); order.push('refresh-end'); });
  const next = runtime.execute(7, manifest, 'https://example.com', async () => order.push('next-call'));
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(order, ['call-start']);
  finishCall(); await first;
  while (!finishRefresh) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['call-start', 'call-end', 'refresh-start']);
  finishRefresh(); await refresh; await next;
  assert.deepEqual(order, ['call-start', 'call-end', 'refresh-start', 'refresh-end', 'next-call']);
});
test('failed refresh releases its queue and does not block another tab', async () => {
  const runtime = createHostAdapterRuntime({}); let reject;
  const blocked = runtime.exclusive(7, () => new Promise((resolve, fail) => reject = fail));
  await runtime.exclusive(8, async () => {});
  const next = runtime.exclusive(7, async () => 'resumed');
  reject(new Error('Example refresh failure'));
  await assert.rejects(blocked, /Example refresh failure/); assert.equal(await next, 'resumed');
});

test('write terminal navigation runs the submitted handler once and returns its result', async () => {
  const navigations = [];
  const runtime = createHostAdapterRuntime({
    bundle: async () => [], prepare: async () => {}, clear: async () => {}, inject: async () => {},
    navigate: async (_tabId, url) => { navigations.push(url); return url; },
  });
  const manifest = {
    name: 'ssh.example.com', match: ['ssh.example.com'],
    _hostSnapshot: { digest: 'fixture-digest' },
    commands: [{ id: 'connect', safety: 'write' }],
  };
  let calls = 0;
  const result = await runtime.execute(7, manifest, 'https://ssh.example.com/controller', async () => {
    calls += 1;
    return {
      __webcli_navigation: {
        version: 1,
        url: 'https://ssh.example.com/terminal',
        resume: false,
        result: { submitted: true, status: 'submitted_terminal_navigation_completed' },
      },
    };
  }, { id: 'connect', safety: 'write' });

  assert.deepEqual(result, { submitted: true, status: 'submitted_terminal_navigation_completed' });
  assert.deepEqual(navigations, ['https://ssh.example.com/terminal']);
  assert.equal(calls, 1);
});

test('a failed terminal navigation never replays the submitted write', async () => {
  const runtime = createHostAdapterRuntime({
    bundle: async () => [], prepare: async () => {}, clear: async () => {}, inject: async () => {},
    navigate: async () => { throw new Error('terminal navigation failed'); },
  });
  const manifest = {
    name: 'ssh.example.com', match: ['ssh.example.com'],
    _hostSnapshot: { digest: 'fixture-digest' },
    commands: [{ id: 'connect', safety: 'write' }],
  };
  let calls = 0;
  await assert.rejects(() => runtime.execute(7, manifest, 'https://ssh.example.com/controller', async () => {
    calls += 1;
    return {
      __webcli_navigation: {
        version: 1,
        url: 'https://ssh.example.com/terminal',
        resume: false,
        result: { submitted: true },
      },
    };
  }, { id: 'connect', safety: 'write' }), /terminal navigation failed/);
  assert.equal(calls, 1);
});