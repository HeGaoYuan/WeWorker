import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureTabViaDebugger,
  createToolTabTracker,
  debuggerTargetId,
  displayPageUrl,
  pickScreenshotTab,
  selectTabForScreenshot,
  withStepTimeout,
} from '../background/screenshot.js';

const blank = { id: 1, windowId: 5, url: 'about:blank', active: true };
const site = { id: 7, windowId: 5, url: 'https://pay.example.com/checkout?session=placeholder', active: false };

function tabsApi(tabs, calls = []) {
  return {
    get: async (id) => {
      const tab = tabs.find((item) => item.id === id);
      if (!tab) throw new Error(`No tab with id: ${id}`);
      return tab;
    },
    query: async (info) => {
      calls.push(['query', info]);
      return tabs.filter((tab) => !info.active || tab.active);
    },
    update: async (id, props) => {
      calls.push(['update', id, props]);
      const tab = tabs.find((item) => item.id === id);
      Object.assign(tab, props);
      return { ...tab };
    },
  };
}

test('the tab of the last Adapter call is captured, not the window\'s active tab', async () => {
  const api = { tabs: tabsApi([{ ...blank }, { ...site }]) };
  const picked = await pickScreenshotTab({ api, toolTabId: 7 });
  assert.equal(picked.tab.id, 7);
  assert.equal(picked.reason, 'last_tool_call');
});

test('an explicit tab wins; a missing one is an error instead of a silent fallback', async () => {
  const api = { tabs: tabsApi([{ ...blank }, { ...site }]) };
  assert.equal((await pickScreenshotTab({ api, tabId: 1, toolTabId: 7 })).reason, 'requested');
  await assert.rejects(pickScreenshotTab({ api, tabId: 99, toolTabId: 7 }), /99 不存在/);
});

test('without a tool tab (or once it is closed) the active tab of the last focused window is used', async () => {
  const calls = [];
  const api = { tabs: tabsApi([{ ...blank }, { ...site }], calls) };
  const picked = await pickScreenshotTab({ api, toolTabId: 42 });
  assert.equal(picked.tab.id, 1);
  assert.equal(picked.reason, 'active_tab');
  assert.deepEqual(calls[0], ['query', { active: true, lastFocusedWindow: true }]);
  await assert.rejects(pickScreenshotTab({ api: { tabs: tabsApi([]) } }), /未找到可截图的标签页/);
});

test('a background tab is selected in its window and given time to paint; an active one is left alone', async () => {
  const calls = [];
  const waits = [];
  const api = { tabs: tabsApi([{ ...blank }, { ...site }], calls) };
  const selected = await selectTabForScreenshot({ api, tab: { ...site }, wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(calls, [['update', 7, { active: true }]]);
  assert.equal(selected.active, true);
  assert.equal(selected.url, site.url, 'tab fields survive a partial update result');
  assert.equal(waits.length, 1);
  calls.length = 0;
  await selectTabForScreenshot({ api, tab: { ...blank }, wait: async () => assert.fail('no wait') });
  assert.deepEqual(calls, []);
});

test('the tool tab survives a service worker restart through session storage', async () => {
  const store = {};
  const api = { storage: { session: {
    set: async (items) => Object.assign(store, items),
    get: async (key) => ({ [key]: store[key] }),
  } } };
  createToolTabTracker(api).note(7);
  await new Promise(setImmediate);
  assert.equal(await createToolTabTracker(api).get(), 7);
  // Without storage the value is kept in memory.
  const memoryOnly = createToolTabTracker(undefined);
  memoryOnly.note(3);
  memoryOnly.note('not-a-tab');
  assert.equal(await memoryOnly.get(), 3);
});

test('the CDP target id is read without attaching', async () => {
  const api = { debugger: { getTargets: async () => [
    { id: 'worker', type: 'worker' },
    { id: 'target-7', type: 'page', tabId: 7 },
  ] } };
  assert.equal(await debuggerTargetId({ api, tabId: 7 }), 'target-7');
  assert.equal(await debuggerTargetId({ api, tabId: 8 }), null);
  assert.equal(await debuggerTargetId({ api: { debugger: { getTargets: async () => { throw new Error('no'); } } }, tabId: 7 }), null);
});

function debuggerApi({ capture = async () => ({ data: 'ZmFrZQ==' }), attach = async () => {} } = {}) {
  const calls = [];
  return {
    calls,
    api: { debugger: {
      attach: async (target) => { calls.push(['attach', target.tabId]); return attach(); },
      detach: async (target) => { calls.push(['detach', target.tabId]); },
      sendCommand: async (target, method) => { calls.push([method, target.tabId]); return capture(); },
    } },
  };
}

test('a debugger capture attaches, captures and always detaches', async () => {
  const ok = debuggerApi();
  const lines = [];
  assert.equal(await captureTabViaDebugger({ api: ok.api, tabId: 7, log: (line) => lines.push(line) }), 'data:image/jpeg;base64,ZmFrZQ==');
  assert.deepEqual(ok.calls, [['attach', 7], ['Page.captureScreenshot', 7], ['detach', 7]]);
  assert.ok(lines.some((line) => line.startsWith('Page.captureScreenshot done')));

  const failing = debuggerApi({ capture: async () => { throw new Error('Target closed'); } });
  await assert.rejects(captureTabViaDebugger({ api: failing.api, tabId: 7 }), /Target closed/);
  assert.deepEqual(failing.calls.at(-1), ['detach', 7]);
});

test('a capture that never answers times out and still detaches, so the next capture can attach', async () => {
  const stuck = debuggerApi({ capture: () => new Promise(() => {}) });
  await assert.rejects(
    captureTabViaDebugger({ api: stuck.api, tabId: 7, timeouts: { attach: 50, capture: 20 } }),
    (error) => error.code === 'SCREENSHOT_TIMEOUT' && error.step === 'Page.captureScreenshot',
  );
  assert.deepEqual(stuck.calls, [['attach', 7], ['Page.captureScreenshot', 7], ['detach', 7]]);
});

test('an attach that finishes after its timeout is detached again', async () => {
  let finishAttach;
  const late = debuggerApi({ attach: () => new Promise((resolve) => { finishAttach = resolve; }) });
  await assert.rejects(captureTabViaDebugger({ api: late.api, tabId: 7, timeouts: { attach: 20, capture: 20 } }), /debugger\.attach 超时/);
  assert.deepEqual(late.calls, [['attach', 7]]);
  finishAttach();
  await new Promise(setImmediate);
  assert.deepEqual(late.calls, [['attach', 7], ['detach', 7]]);
});

test('a borrowed debugger session is used without attaching or detaching', async () => {
  const borrowed = debuggerApi();
  await captureTabViaDebugger({ api: borrowed.api, tabId: 7, borrowed: true });
  assert.deepEqual(borrowed.calls, [['Page.captureScreenshot', 7]]);
});

test('step timeouts clear their timer once the step settles', async () => {
  assert.equal(await withStepTimeout(Promise.resolve('done'), 10, 'step'), 'done');
});

test('page URLs are reported without query or fragment', () => {
  assert.equal(displayPageUrl(site.url), 'https://pay.example.com/checkout');
  assert.equal(displayPageUrl('about:blank'), 'about:blank');
  assert.equal(displayPageUrl('not a url'), '');
});
