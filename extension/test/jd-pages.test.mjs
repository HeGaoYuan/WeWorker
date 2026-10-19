import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createDocument, h } from './helpers/mini-dom.mjs';

const source = readFileSync(new URL('../../adapters/jd.com/extension/internal/pages.js', import.meta.url), 'utf8');

/** Load pages.js against a fixture document; class names carry CSS-module hashes like JD's. */
function load(document, href) {
  const url = new URL(href);
  const window = {};
  const context = vm.createContext({ window, document, location: { href, origin: url.origin, hostname: url.hostname, pathname: url.pathname, search: url.search }, URL, setTimeout, Date, Math, parseInt, parseFloat });
  vm.runInContext(source, context);
  // Results cross the vm realm; compare them as the JSON the host receives.
  const plain = (fn) => async (...args) => { const value = await fn(...args); return value == null ? value : JSON.parse(JSON.stringify(value)); };
  const pages = window.__jd_com_pages;
  return { ...pages, readOrders: plain(pages.readOrders), readSearch: plain(pages.readSearch), readCart: plain(pages.readCart) };
}

// ─── Order center fixture (placeholder data) ───

const money = (value) => h('div', { class: 'priceRow-56eb40' }, h('span', { class: 'priceSymbol-5b0dc9' }, '¥'), h('span', { class: 'priceInteger-32b5af' }, String(Math.floor(value))), h('span', { class: 'priceDecimal-fca86d' }, '.' + String(value.toFixed(2)).split('.')[1]));
const product = (sku, name) => h('div', { class: 'productItemWrapper-5510b5' },
  h('a', { class: 'goodImg-5d650c', href: `//item.jd.com/${sku}.html`, title: name }, h('img', { src: `//img.example.com/${sku}.jpg` })),
  h('div', { class: 'productInfo-634b25' }, h('h3', { class: 'productTitle-aa0842', title: name }, name),
    h('div', { class: 'productCount-7355e6' }, h('span', {}, '共'), h('span', { class: 'countNum-d453df' }, '2'), h('span', {}, '件'))));
const card = ({ id, time, status, amount, products, sub = false }) => h('div', { class: 'orderCard-b731ca' },
  h('div', { class: `header-c3768c${sub ? ' splitOrderHeader-e2135e' : ''}` },
    h('div', { class: 'headerMiddle-17ef2a' }, h('div', { class: 'headerLeft-b5d8cb' },
      h('div', { class: 'orderTime-4e55a3' }, h('div', { class: 'metaValue-7993e4' }, time)),
      h('div', { class: 'orderMetas-4f212f' }, h('div', { class: 'metaLabel-23db69' }, '订单号'), h('div', { class: 'metaValue-7993e4' }, id)),
      h('div', { class: 'shopInfo-a27b0a' }, h('span', { class: 'shopNames-53c072', title: 'Example Shop' }, 'Example Shop')))),
    h('div', { class: 'headerRight-5412a3' }, h('span', { class: 'statusText-ca72c5' }, status))),
  h('div', { class: 'orderBody-6b35e2' }, h('div', {},
    h('div', { class: 'productListContainer-71c0d9' }, h('div', { class: 'productList-386ae9' }, products)),
    h('div', { class: 'priceActionSection-68d47c' }, h('div', { class: 'paymentTypestyle-437538' },
      h('div', { class: 'priceColumn-6ab3c7' }, money(amount)), h('div', { class: 'paymentTypeName-4077b2' }, '在线支付'))))));
const banner = ({ id, time, amount }) => h('div', { class: 'splitBanner-3d0a26' },
  h('div', { class: 'metaSection-3341e2' },
    h('div', { class: 'infoGroup-a9d86c' }, h('span', { class: 'orderTimeValue-ae8102', title: time }, time)),
    h('div', { class: 'infoGroup-a9d86c' }, h('span', { class: 'label-e62d6f' }, '订单号'), h('span', { class: 'value-5c88b5' }, id)),
    h('div', { class: 'infoGroup-a9d86c' }, h('span', { class: 'label-e62d6f' }, '订单金额'), h('span', { class: 'value-5c88b5' }, `¥${amount.toFixed(2)}`))),
  h('div', { class: 'notificationSection-a88a6b' }, h('span', { class: 'noticeText-254fc4', title: '拆分配送' }, '拆分配送')));

/** Two pages; the split order 300000000000002 continues from page 1 onto page 2. */
function orderCenter() {
  const pages = {
    1: [
      h('div', {}, h('div', {}, card({ id: '300000000000001', time: '2026-10-18 13:24:47', status: '已完成', amount: 101, products: [product('100001', 'Fixture Item A')] }))),
      h('div', {}, banner({ id: '300000000000002', time: '2026-10-14 23:43:19', amount: 53.35 }),
        h('div', {}, card({ id: '300000000000003', time: '2026-10-14 23:43:19', status: '已完成', amount: 20, products: [product('100002', 'Fixture Item B')], sub: true }))),
    ],
    2: [
      h('div', {}, h('div', {}, card({ id: '300000000000004', time: '2026-10-14 23:43:19', status: '运输中', amount: 33.35, products: [product('100003', 'Fixture Item C')], sub: true }))),
      h('div', {}, h('div', {}, card({ id: '300000000000005', time: '2026-10-09 09:00:00', status: '已取消', amount: 999, products: [product('100004', 'Fixture Item D')] }))),
      h('div', {}, h('div', {}, card({ id: '300000000000006', time: '2026-09-30 08:00:00', status: '已完成', amount: 10, products: [product('100005', 'Fixture Item E')] }))),
    ],
  };
  let current = 1;
  const list = h('div', { class: 'listContent-c79c2f' }, pages[1]);
  const items = [1, 2].map((n) => h('div', { class: `pageItem-dede24${n === 1 ? ' activePage-94ff0d' : ''}`, onclick: () => show(n) }, String(n)));
  const next = h('button', { class: 'nextBtn-06264f', onclick: () => show(current + 1) }, h('span', {}, '下一页'));
  function show(n) {
    if (!pages[n]) return;
    current = n;
    list.setChildren(pages[n]);
    items.forEach((item, index) => { item.attributes.class = `pageItem-dede24${index + 1 === n ? ' activePage-94ff0d' : ''}`; });
    next.disabled = n === 2;
  }
  const document = createDocument([
    h('div', { class: 'selectContainer-73b052' }, h('span', { class: 'text-651132' }, '近3个月订单')),
    list,
    h('div', { class: 'pagination-38e1b7' }, h('div', { class: 'pageNumbers-d308c4' }, ...items, next),
      h('div', { class: 'jumpSection-30a829' }, h('span', { class: 'totalText-3d55df' }, '共2页'))),
  ]);
  return { document, show };
}

test('orders: a split order spanning two pages is one order with all its sub-orders', async () => {
  const { document } = orderCenter();
  const pages = load(document, 'https://order.jd.hk/center/list.action');
  const result = await pages.readOrders({ maxPages: 2 });
  assert.equal(result.complete, true);
  assert.equal(result.pagesRead, 2);
  assert.deepEqual(result.orders.map((order) => order.orderId), ['300000000000001', '300000000000002', '300000000000005', '300000000000006']);
  const split = result.orders[1];
  assert.equal(split.isSplit, true);
  assert.equal(split.amount, 53.35);
  assert.deepEqual(split.subOrders.map((sub) => [sub.orderId, sub.amount, sub.statusCategory]), [['300000000000003', 20, 'completed'], ['300000000000004', 33.35, 'shipping']]);
  const first = result.orders[0];
  assert.deepEqual({ time: first.orderTime, shop: first.shop, status: first.statusCategory, amount: first.amount, pay: first.paymentMethod },
    { time: '2026-10-18 13:24:47', shop: 'Example Shop', status: 'completed', amount: 101, pay: '在线支付' });
  assert.deepEqual(first.products, [{ name: 'Fixture Item A', sku: '100001', url: 'https://item.jd.com/100001.html', image: 'https://img.example.com/100001.jpg', quantity: 2 }]);
  // Split orders count once (by the parent); cancelled orders are not counted.
  assert.deepEqual({ orders: result.summary.orderCount, cancelled: result.summary.cancelledCount, total: result.summary.totalAmount }, { orders: 4, cancelled: 1, total: 164.35 });
});

test('orders: since stops at older orders and starts from page 1 even if the list was left on page 2', async () => {
  const { document, show } = orderCenter();
  show(2);
  const pages = load(document, 'https://order.jd.hk/center/list.action');
  const result = await pages.readOrders({ since: '2026-10-01' });
  assert.equal(result.complete, true);
  assert.equal(result.since, '2026-10-01');
  assert.deepEqual(result.orders.map((order) => order.orderId), ['300000000000001', '300000000000002', '300000000000005']);
  assert.equal(result.summary.totalAmount, 154.35);
});

test('orders: one page by default reports that more pages exist', async () => {
  const { document } = orderCenter();
  const result = await load(document, 'https://order.jd.com/center/list.action').readOrders({});
  assert.equal(result.pagesRead, 1);
  assert.equal(result.totalPages, 2);
  assert.equal(result.complete, false);
});

test('orders: an older page layout without order cards falls back to the original reader', async () => {
  const document = createDocument([h('table', {}, h('tbody', { id: 'tb-1' }))]);
  const pages = load(document, 'https://order.jd.com/center/list.action');
  const realNow = Date.now;
  // Skip the 10 s wait: every clock read advances 20 s.
  let clock = realNow();
  Date.now = () => (clock += 20_000);
  try { assert.equal(await pages.readOrders({}), null); } finally { Date.now = realNow; }
});

test('search: cards are read by data-sku and stable class prefixes', async () => {
  const cardEl = (sku, title, price) => h('div', { class: '_wrapper_1y1ag_3 plugin_goodsCardWrapper', 'data-sku': sku },
    h('img', { class: '_img_18s24_1', src: `//img.example.com/${sku}.jpg` }),
    h('div', { class: '_goods_title_container_1k2fi_1' }, h('span', { class: '_newStyle_1k2fi_39' }, title)),
    h('span', { class: '_price_9y3st_31' }, h('i', { class: '_yen_9y3st_27' }, '¥'), h('span', {}, String(price)), h('span', {}, '.'), h('span', { class: '_decimal_9y3st_45' }, '90')),
    h('span', { class: '_gray_9y3st_78' }, '¥199'),
    h('a', { href: '//mall.jd.com/index-1.html' }, 'Example Store'));
  const document = createDocument([h('div', { class: '_goodsContainer_bryc4_2 plugin_goodsContainer' },
    cardEl('200001', 'Fixture Headphones', 99), cardEl('200001', 'Duplicate', 1), cardEl('200002', 'Fixture Earbuds', 59))]);
  const result = await load(document, 'https://search.jd.com/Search?keyword=x').readSearch({ keyword: 'x' });
  assert.equal(result.totalProducts, 2);
  assert.deepEqual(result.products[0], { sku: '200001', title: 'Fixture Headphones', price: 99.9, originalPrice: 199, shop: 'Example Store', sales: '', image: 'https://img.example.com/200001.jpg', url: 'https://item.jd.com/200001.html' });
});

test('cart: items with price, quantity, selection and an estimate of the ticked items', async () => {
  const item = (sku, name, price, qty, checked) => h('div', { class: '_product-item_88ueb_1' },
    h('div', { class: '_good-check_r7tg3_1' }, h('input', { type: 'checkbox', checked })),
    h('img', { src: `//img.example.com/${sku}.jpg` }),
    h('a', { class: '_goodTitle_1kgc5_1', href: `//item.jd.com/${sku}.html`, title: name }, name),
    h('div', { class: '_extra-select_8vvh7_1', title: '颜色: 白色' }),
    h('span', { class: '_price-normal_1in3n_18', title: `¥${price}` }, `¥${price}`),
    h('div', { class: '_cart-number_1ep1a_1' }, h('input', { value: String(qty) })));
  const document = createDocument([
    h('div', { class: '_cartNum_11omx_29' }, h('span', {}, '全部'), h('span', { class: 'number' }, h('span', {}, '3'))),
    h('div', { class: '_card_1v6li_1' }, h('span', { class: '_title-txt_19mks_6' }, 'Example Shop'),
      item('300001', 'Fixture Soap', 9.9, 2, true), item('300002', 'Fixture Towel', 20, 1, false)),
  ]);
  const result = await load(document, 'https://cart.jd.com/cart_index').readCart();
  assert.equal(result.totalItems, 2);
  assert.equal(result.cartCount, 3);
  assert.equal(result.selectedEstimate, 19.8);
  assert.deepEqual(result.items[0], { name: 'Fixture Soap', sku: '300001', url: 'https://item.jd.com/300001.html', image: 'https://img.example.com/300001.jpg', price: 9.9, quantity: 2, selected: true, spec: '颜色: 白色', shop: 'Example Shop' });
});

test('money and status helpers', () => {
  const pages = load(createDocument([]), 'https://www.jd.com/');
  assert.equal(pages.parseMoney('¥1,299.50'), 1299.5);
  assert.equal(pages.parseMoney('￥ 0.00'), 0);
  assert.equal(pages.parseMoney('—'), null);
  assert.equal(pages.statusCategory('已取消'), 'cancelled');
  assert.equal(pages.statusCategory('运输中'), 'shipping');
  assert.equal(pages.statusCategory('等待付款'), 'pending_payment');
});

// ─── buy-now: the product's own button, never a recommendation card in the header ───

async function runBuyNow(document, href) {
  let handler;
  const url = new URL(href);
  const timers = [];
  const context = vm.createContext({
    document, URL,
    location: { href, origin: url.origin, hostname: url.hostname, pathname: url.pathname },
    // Settle every wait at once.
    setTimeout: (fn) => { timers.push(fn); queueMicrotask(() => timers.shift()?.()); },
    __webcliRegisterCommand: (name, fn) => { if (name === 'buy-now') handler = fn; },
  });
  vm.runInContext(readFileSync(new URL('../../adapters/jd.com/extension/commands/buy-now.js', import.meta.url), 'utf8'), context);
  return JSON.parse(JSON.stringify(await handler({})));
}
const box = (el) => Object.assign(el, { getBoundingClientRect: () => ({ width: 100, height: 40, top: 0, left: 0 }) });

test('buy-now clicks the product button and opens the checkout page as the tab itself', async () => {
  let clicked = '';
  const body = h('div', {});
  const header = box(h('button', { class: 'cross_platform_card_btn_buy', onclick: () => { clicked = 'header'; } }, '立即购买'));
  const buy = box(h('div', { onclick: () => { clicked = 'product'; body.setChildren([h('iframe', { src: 'https://pc-settlement-lite-pro.pf.jd.com/checkout?sku=1' })]); } }, '立即购买'));
  const document = createDocument([
    h('li', { class: 'shortcut_btn fore2 cross_platform_entry' }, header),
    h('div', { class: 'bottom-btns-root' }, h('div', { id: 'add-to-cart' }, h('div', { class: 'first-row' }, box(h('div', {}, '加入购物车')))),
      h('div', {}, h('div', { class: 'first-row' }, buy))),
    body,
  ]);
  const result = await runBuyNow(document, 'https://item.jd.com/100001.html');
  assert.equal(clicked, 'product');
  assert.equal(result.__webcli_navigation.url, 'https://pc-settlement-lite-pro.pf.jd.com/checkout?sku=1');
  assert.equal(result.__webcli_navigation.resume, false);
  assert.equal(result.__webcli_navigation.result.checkoutUrl, 'https://pc-settlement-lite-pro.pf.jd.com/checkout');
});

test('buy-now reports the available buttons when the product cannot be bought directly', async () => {
  const document = createDocument([h('div', { class: 'bottom-btns-root' }, h('div', { class: 'first-row' }, box(h('div', {}, '到货通知'))))]);
  const result = await runBuyNow(document, 'https://item.jd.com/100001.html');
  assert.equal(result.error, 'Buy button not found');
  assert.deepEqual(result.buttons, ['到货通知']);
  assert.equal((await runBuyNow(createDocument([]), 'https://www.jd.com/')).error, 'Not on product page');
});
