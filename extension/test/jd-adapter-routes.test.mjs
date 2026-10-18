import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { assertAdapterNavigationUrl } from '../background/host-adapter-runtime.js';

const root = new URL('../../adapters/jd.com/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

/** Run one v2 command file on a fake page and return what its handler answers. */
async function runCommand(id, href, params = {}) {
  let handler;
  const url = new URL(href);
  const context = vm.createContext({
    URLSearchParams,
    location: { href, hostname: url.hostname, pathname: url.pathname, search: url.search },
    __webcliRegisterCommand: (name, fn) => { if (name === id) handler = fn; },
    window: { __jd_com_internal: { invoke: async (name) => ({ invoked: name }) } },
  });
  vm.runInContext(readFileSync(new URL(`extension/commands/${id}.js`, root), 'utf8'), context);
  return JSON.parse(JSON.stringify(await handler(params)));
}

test('JD pages live on declared hosts; route-less commands open the real homepage', () => {
  assert.equal(manifest.match[0], 'www.jd.com');
  for (const url of ['https://www.jd.com/', 'https://order.jd.com/center/list.action', 'https://search.jd.com/Search?keyword=x', 'https://item.jd.com/1.html', 'https://cart.jd.com/cart_index']) {
    assert.equal(assertAdapterNavigationUrl(manifest, url), url);
  }
  assert.equal(manifest.homepage_url, 'https://www.jd.com/');
  assert.equal(manifest.commands.find((command) => command.id === 'view-orders').routeDomain, 'order.jd.com');
});

test('view-orders reaches the order list in one call', async () => {
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.com/'), {
    __webcli_navigation: { version: 1, url: 'https://order.jd.com/center/list.action', resume: true },
  });
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.com/center/list.action?d=2'), { invoked: 'jd.com.view_orders' });
});

test('search-products opens the results for the requested keyword', async () => {
  assert.deepEqual(await runCommand('search-products', 'https://www.jd.com/', { keyword: '耳机' }), {
    __webcli_navigation: { version: 1, url: 'https://search.jd.com/Search?keyword=%E8%80%B3%E6%9C%BA&enc=utf-8', resume: true },
  });
  assert.deepEqual(await runCommand('search-products', 'https://search.jd.com/Search?keyword=%E8%80%B3%E6%9C%BA&enc=utf-8', { keyword: '耳机' }), { invoked: 'jd.com.search_products' });
});
