import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { assertAdapterNavigationUrl } from '../background/host-adapter-runtime.js';
import { isLoginPageUrl } from '../background/site-auth.js';

const root = new URL('../../adapters/jd.com/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

/** Run one v2 command file on a fake page and return what its handler answers. */
async function runCommand(id, href, params = {}, { orders = 'read' } = {}) {
  let handler;
  const url = new URL(href);
  const context = vm.createContext({
    URLSearchParams, URL,
    location: { href, hostname: url.hostname, pathname: url.pathname, search: url.search },
    __webcliRegisterCommand: (name, fn) => { if (name === id) handler = fn; },
    window: {
      __jd_com_internal: { invoke: async (name) => ({ invoked: name }) },
      __jd_com_pages: {
        readOrders: async (p) => (orders === null ? null : { read: 'orders', params: p }),
        readSearch: async (p) => ({ read: 'search', params: p }),
        readCart: async () => ({ read: 'cart' }),
      },
    },
  });
  vm.runInContext(readFileSync(new URL(`extension/commands/${id}.js`, root), 'utf8'), context);
  return JSON.parse(JSON.stringify(await handler(params)));
}

test('JD pages live on declared hosts; route-less commands open the real homepage', () => {
  assert.equal(manifest.match[0], 'www.jd.com');
  // Site domains cover every JD page host, including the regional order list on order.jd.hk.
  for (const url of ['https://www.jd.com/', 'https://order.jd.com/center/list.action', 'https://order.jd.hk/center/list.action',
    'https://search.jd.com/Search?keyword=x', 'https://item.jd.com/1.html', 'https://cart.jd.com/cart_index', 'https://home.jd.com/']) {
    assert.equal(assertAdapterNavigationUrl(manifest, url), url);
  }
  assert.throws(() => assertAdapterNavigationUrl(manifest, 'https://www.example.com/'), /not allowed/);
  assert.equal(manifest.homepage_url, 'https://www.jd.com/');
  assert.equal(manifest.commands.find((command) => command.id === 'view-orders').routeDomain, 'order.jd.com');
  // JD's device verification page waits for the user like a login page.
  assert.equal(isLoginPageUrl(manifest, 'https://aq.jd.com/certified/index'), true);
  assert.equal(isLoginPageUrl(manifest, 'https://order.jd.hk/center/list.action'), false);
});

test('view-orders reaches the order list in one call', async () => {
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.com/'), {
    __webcli_navigation: { version: 1, url: 'https://order.jd.com/center/list.action', resume: true },
  });
  // The current order center is read by pages.js; parameters are passed through.
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.com/center/list.action?d=2', { since: '2026-10-01' }), { read: 'orders', params: { since: '2026-10-01' } });
  // Accounts redirected to the regional order list are read there instead of looping.
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.hk/center/list.action'), { read: 'orders', params: {} });
  // An older page layout (no order cards) keeps the original reader.
  assert.deepEqual(await runCommand('view-orders', 'https://order.jd.com/center/list.action', {}, { orders: null }), { invoked: 'jd.com.view_orders' });
});

test('search-products opens the results for the requested keyword', async () => {
  assert.deepEqual(await runCommand('search-products', 'https://www.jd.com/', { keyword: '耳机' }), {
    __webcli_navigation: { version: 1, url: 'https://search.jd.com/Search?keyword=%E8%80%B3%E6%9C%BA&enc=utf-8', resume: true },
  });
  assert.deepEqual(await runCommand('search-products', 'https://search.jd.com/Search?keyword=%E8%80%B3%E6%9C%BA&enc=utf-8', { keyword: '耳机' }), { read: 'search', params: { keyword: '耳机' } });
  assert.match((await runCommand('search-products', 'https://www.jd.com/', {})).message, /keyword/);
});

test('open-product loads the page through the host, by URL or SKU', async () => {
  const done = (url) => ({ __webcli_navigation: { version: 1, url, resume: false, result: { status: 'success', productUrl: url } } });
  assert.deepEqual(await runCommand('open-product', 'https://www.jd.com/', { url: '//item.jd.com/100001.html' }), done('https://item.jd.com/100001.html'));
  assert.deepEqual(await runCommand('open-product', 'https://www.jd.com/', { sku: '100002' }), done('https://item.jd.com/100002.html'));
  assert.deepEqual(await runCommand('open-product', 'https://item.jd.com/100002.html', { sku: '100002' }), { status: 'success', productUrl: 'https://item.jd.com/100002.html' });
  assert.equal((await runCommand('open-product', 'https://www.jd.com/', { url: 'https://www.example.com/item.jd.com/1.html' })).error, 'Invalid URL');
});

test('view-cart and navigate-to-homepage finish in one call', async () => {
  assert.deepEqual(await runCommand('view-cart', 'https://www.jd.com/'), {
    __webcli_navigation: { version: 1, url: 'https://cart.jd.com/cart_index', resume: true },
  });
  assert.deepEqual(await runCommand('view-cart', 'https://cart.jd.com/cart_index'), { read: 'cart' });
  // Terminal navigation: the host loads the homepage and returns the result without replaying.
  assert.deepEqual(await runCommand('navigate-to-homepage', 'https://order.jd.hk/center/list.action'), {
    __webcli_navigation: { version: 1, url: 'https://www.jd.com/', resume: false, result: { status: 'success', currentUrl: 'https://www.jd.com/' } },
  });
  assert.deepEqual(await runCommand('navigate-to-homepage', 'https://www.jd.com/'), { status: 'success', currentUrl: 'https://www.jd.com/' });
});
