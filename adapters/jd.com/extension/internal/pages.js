/* jd.com page readers for the current JD web pages (order center, search, cart).
 *
 * JD builds these pages with CSS modules: class names look like `orderCard-b731ca` or
 * `_goodTitle_1kgc5_1`, and the hash changes with every release. Readers therefore match
 * the stable part only ([class*="orderCard-"]) and read values from text, never from the
 * position of a node. Each reader returns plain JSON and never clicks anything that
 * changes an order, the cart or an account. */
(function () {
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  /** First element under `root` whose class contains `part` (CSS-module safe). */
  function q(root, part) { return root ? root.querySelector('[class*="' + part + '"]') : null; }
  function qa(root, part) { return root ? Array.prototype.slice.call(root.querySelectorAll('[class*="' + part + '"]')) : []; }

  function text(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function titleOrText(el) { return el ? (el.getAttribute('title') || text(el)) : ''; }

  function absoluteUrl(value) {
    var url = String(value || '').trim();
    if (!url || url === '#' || /^javascript:/i.test(url)) return '';
    if (url.indexOf('//') === 0) return 'https:' + url;
    try { return new URL(url, location.href).href; } catch (e) { return ''; }
  }

  function imageUrl(img) {
    if (!img) return '';
    return absoluteUrl(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-img') || '');
  }

  /** "¥101.00", "￥ 1,299", "101.00" → 101 / 1299; null when no number. */
  function parseMoney(value) {
    var match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? Math.round(parseFloat(match[1]) * 100) / 100 : null;
  }

  function itemSku(href) {
    var match = String(href || '').match(/item\.jd\.(?:com|hk)\/(\d+)\.html/);
    return match ? match[1] : '';
  }

  /** "2026-10-18 13:24:47" → "2026-10-18" (or '' when absent). */
  function orderDate(value) {
    var match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[0] : '';
  }

  async function waitFor(check, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      var value = check();
      if (value) return value;
      await sleep(250);
    }
    return check();
  }

  function statusCategory(status) {
    if (!status) return 'unknown';
    if (/取消/.test(status)) return 'cancelled';
    if (/已完成|已签收|完成/.test(status)) return 'completed';
    if (/付款|待支付/.test(status)) return 'pending_payment';
    if (/退款|售后/.test(status)) return 'after_sale';
    if (/出库|配送|运输|收货|发货|揽收|派送/.test(status)) return 'shipping';
    return 'other';
  }

  // ─── Order center (order.jd.com / order.jd.hk /center/list.action) ─────────

  function readProducts(card) {
    return qa(card, 'productItemWrapper-').map(function (item) {
      var link = item.querySelector('a[href*="item.jd."]');
      var title = q(item, 'productTitle-');
      var href = absoluteUrl(link && link.getAttribute('href'));
      return {
        name: titleOrText(title) || (link && link.getAttribute('title')) || '',
        sku: itemSku(href),
        url: href,
        image: imageUrl(item.querySelector('img')),
        quantity: parseMoney(text(q(item, 'countNum-'))) || 1,
      };
    }).filter(function (product) { return product.name || product.sku; });
  }

  /** The value next to a label such as 订单号 / 订单金额 inside a header or banner. */
  function labelledValue(root, label) {
    var groups = qa(root, 'infoGroup-').concat(qa(root, 'orderMetas-'));
    for (var i = 0; i < groups.length; i++) {
      if (text(groups[i]).indexOf(label) === -1) continue;
      var value = q(groups[i], 'value-') || q(groups[i], 'metaValue-');
      if (value) return titleOrText(value);
    }
    return '';
  }

  function readOrderCard(card) {
    var header = q(card, 'header-');
    var time = q(header, 'orderTime-');
    var amountEl = q(card, 'priceRow-') || q(card, 'priceColumn-');
    var status = text(q(card, 'statusText-'));
    var products = readProducts(card);
    var toggle = q(card, 'toggleButton-');
    return {
      orderId: (labelledValue(header, '订单号').match(/\d{6,}/) || [''])[0],
      orderTime: titleOrText(q(time, 'metaValue-') || time),
      shop: titleOrText(q(header, 'shopNames-')),
      status: status,
      statusCategory: statusCategory(status),
      amount: parseMoney(text(amountEl)),
      paymentMethod: text(q(card, 'paymentTypeName-')),
      products: products,
      // The card shows the first products; "查看更多" lists the rest.
      moreProducts: !!(toggle && /更多/.test(text(toggle))),
    };
  }

  function splitParent(banner) {
    return {
      orderId: (labelledValue(banner, '订单号').match(/\d{6,}/) || [''])[0],
      orderTime: titleOrText(q(banner, 'orderTimeValue-')),
      status: '已拆分',
      statusCategory: 'split',
      amount: parseMoney(labelledValue(banner, '订单金额')),
      note: titleOrText(q(banner, 'noticeText-')),
      isSplit: true,
      subOrders: [],
    };
  }

  function settleSplit(parent) {
    var subs = parent.subOrders;
    if (subs.length && subs.every(function (sub) { return sub.statusCategory === 'cancelled'; })) {
      parent.status = '已取消';
      parent.statusCategory = 'cancelled';
    }
  }

  /**
   * One entry per order, in list order. The list is flat: a split order's banner sits with
   * its first sub-order, and the remaining sub-orders (cards with a split header) follow as
   * siblings, possibly continuing on the next page. `parent` carries the open split order.
   */
  function readOrderGroups(doc, parent) {
    var list = q(doc, 'listContent-');
    var entries = list ? Array.prototype.slice.call(list.children) : qa(doc, 'orderCard-');
    var orders = [];
    var current = parent || null;
    entries.forEach(function (entry) {
      var banner = /splitBanner-/.test(entry.className || '') ? entry : q(entry, 'splitBanner-');
      var cards = /orderCard-/.test(entry.className || '') ? [entry] : qa(entry, 'orderCard-');
      if (banner) {
        current = splitParent(banner);
        orders.push(current);
      }
      cards.forEach(function (card) {
        var isSub = !!q(card, 'splitOrderHeader-') || /splitOrderHeader-/.test((q(card, 'header-') || {}).className || '');
        if (isSub && current) {
          current.subOrders.push(readOrderCard(card));
          settleSplit(current);
          return;
        }
        current = null;
        orders.push(readOrderCard(card));
      });
    });
    return { orders: orders, parent: current };
  }

  function pageInfo(doc) {
    var pager = q(doc, 'pagination-');
    var active = q(pager, 'activePage-');
    var next = pager && pager.querySelector('[class*="nextBtn-"]');
    var total = text(q(pager, 'totalText-')).match(/(\d+)/);
    return {
      page: parseMoney(text(active)) || 1,
      totalPages: total ? parseInt(total[1], 10) : (pager ? null : 1),
      next: next && !next.disabled && !/disabled/i.test(next.className || '') ? next : null,
    };
  }

  /** The list keeps its page between calls; every read starts from page 1. */
  async function goToFirstPage(doc) {
    if (pageInfo(doc).page <= 1) return true;
    var first = qa(q(doc, 'pagination-'), 'pageItem-').find(function (el) { return text(el) === '1'; });
    if (!first) return false;
    first.click();
    var ok = await waitFor(function () { return pageInfo(doc).page === 1 && readOrderGroups(doc).orders.length ? true : null; }, 8000);
    if (ok) await sleep(300);
    return !!ok;
  }

  /** YYYY-MM-DD of the day `months` months before today (local time). */
  function monthsAgo(months) {
    var day = new Date();
    day.setMonth(day.getMonth() - months);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return day.getFullYear() + '-' + pad(day.getMonth() + 1) + '-' + pad(day.getDate());
  }

  async function expandProducts(doc) {
    var toggles = qa(doc, 'toggleButton-').filter(function (el) { return /更多/.test(text(el)); });
    toggles.forEach(function (el) { el.click(); });
    if (toggles.length) await sleep(400);
  }

  /**
   * Read the order list, optionally across pages, newest first.
   * `since` (YYYY-MM-DD) stops at older orders; `maxPages` caps paging (1–10).
   */
  async function readOrders(params) {
    var since = /^\d{4}-\d{2}-\d{2}$/.test(String(params.since || '')) ? String(params.since) : '';
    var maxPages = Math.max(1, Math.min(10, parseInt(params.maxPages, 10) || (since ? 10 : 1)));
    var ready = await waitFor(function () {
      return qa(document, 'orderCard-').length > 0 || /暂无订单|没有订单|还没有订单/.test(text(q(document, 'listContent-')) || '') ? true : null;
    }, 10000);
    if (!ready) return null;
    var onFirstPage = await goToFirstPage(document);

    var orders = [];
    var byId = {};
    var pagesRead = 0;
    var reachedSince = false;
    var parent = null;
    var info = pageInfo(document);
    var add = function (order) {
      var day = orderDate(order.orderTime);
      if (since && day && day < since) { reachedSince = true; return; }
      var known = order.orderId && byId[order.orderId];
      if (!known) {
        if (order.orderId) byId[order.orderId] = order;
        orders.push(order);
        return;
      }
      // A split order repeated at the top of the next page: keep one entry with all sub-orders.
      (order.subOrders || []).forEach(function (sub) {
        if (!known.subOrders) known.subOrders = [];
        if (!known.subOrders.some(function (seen) { return seen.orderId === sub.orderId; })) known.subOrders.push(sub);
      });
    };
    for (;;) {
      await expandProducts(document);
      var page = readOrderGroups(document, parent);
      pagesRead++;
      page.orders.forEach(add);
      // Sub-orders that continue on the next page belong to the split order still open here.
      parent = page.parent && byId[page.parent.orderId] ? byId[page.parent.orderId] : page.parent;
      info = pageInfo(document);
      if (reachedSince || pagesRead >= maxPages || !info.next) break;
      // Paging is part of the same list view; it changes nothing on the account.
      var before = info.page;
      info.next.click();
      var changed = await waitFor(function () {
        return pageInfo(document).page !== before && readOrderGroups(document).orders.length ? true : null;
      }, 8000);
      if (!changed) break;
      await sleep(300);
    }
    orders.forEach(function (order) { if (order.isSplit) settleSplit(order); });

    var counted = orders.filter(function (order) { return order.statusCategory !== 'cancelled' && typeof order.amount === 'number'; });
    var total = counted.reduce(function (sum, order) { return sum + order.amount; }, 0);
    var range = text(q(document, 'selectContainer-'));
    // The default view lists about three months; an earlier `since` cannot be completed here.
    var beyondRange = !!(since && !reachedSince && /3个月/.test(range) && since < monthsAgo(3));
    var notes = [];
    if (!onFirstPage) notes.push('未能回到第 1 页，结果可能缺少最新的订单。');
    if (beyondRange) notes.push('页面只列出近 3 个月的订单，更早的订单需要在京东订单页切换年份查看。');
    return {
      status: 'success',
      currentUrl: location.origin + location.pathname,
      range: range,
      since: since || undefined,
      pagesRead: pagesRead,
      totalPages: info.totalPages,
      // Complete when every order of the range (or since the given day) was read.
      complete: onFirstPage && !beyondRange && (reachedSince || !info.next),
      notes: notes.length ? notes : undefined,
      totalOrders: orders.length,
      summary: {
        orderCount: orders.length,
        cancelledCount: orders.length - orders.filter(function (order) { return order.statusCategory !== 'cancelled'; }).length,
        totalAmount: Math.round(total * 100) / 100,
        currency: 'CNY',
        note: '合计为订单金额（拆分订单按主订单计一次），不含已取消订单；退款以订单详情为准。',
      },
      orders: orders,
    };
  }

  // ─── Search results (search.jd.com/Search) ─────────────────────────────────

  async function readSearch(params) {
    await waitFor(function () { return document.querySelector('[data-sku]') ? true : null; }, 10000);
    var cards = Array.prototype.slice.call(document.querySelectorAll('[class*="goodsContainer"] [data-sku], [class*="goodsCard"][data-sku]'));
    if (!cards.length) cards = Array.prototype.slice.call(document.querySelectorAll('[data-sku]'));
    var limit = Math.max(1, Math.min(60, parseInt(params.limit, 10) || 30));
    var seen = {};
    var products = [];
    cards.forEach(function (card) {
      var sku = card.getAttribute('data-sku');
      if (!sku || seen[sku] || products.length >= limit) return;
      var titleBox = q(card, '_goods_title_container_') || q(card, 'title');
      var titleSpans = titleBox ? titleBox.querySelectorAll('span') : [];
      var title = (titleBox && titleBox.getAttribute('title'))
        || (titleSpans.length ? text(titleSpans[titleSpans.length - 1]) : text(titleBox))
        || (card.querySelector('[title]') && card.querySelector('[title]').getAttribute('title')) || '';
      var price = card.querySelector('span[class*="_price_"]');
      var shop = card.querySelector('a[href*="mall.jd.com"], a[href*="shop"], [class*="_shop"] span, [class*="_name_"] span');
      var sales = q(card, '_goods_volume_');
      if (!title) return;
      seen[sku] = true;
      products.push({
        sku: sku,
        title: title,
        price: parseMoney(text(price)),
        originalPrice: parseMoney(text(q(card, '_gray_'))),
        shop: text(shop),
        sales: titleOrText(sales && (sales.querySelector('span') || sales)),
        image: imageUrl(card.querySelector('img')),
        url: 'https://item.jd.com/' + sku + '.html',
      });
    });
    return {
      status: 'success',
      keyword: String(params.keyword || '').trim(),
      currentUrl: location.origin + location.pathname,
      totalProducts: products.length,
      products: products,
    };
  }

  // ─── Cart (cart.jd.com) ────────────────────────────────────────────────────

  async function readCart() {
    await waitFor(function () {
      return q(document, '_product-item_') || /购物车空空|购物车是空的|去逛逛/.test(text(document.body)) ? true : null;
    }, 10000);
    var items = qa(document, '_product-item_').map(function (item) {
      var link = item.querySelector('a[href*="item.jd."]');
      var href = absoluteUrl(link && link.getAttribute('href'));
      var card = item.closest('[class*="_card_"]');
      var check = q(item, '_good-check_');
      var box = check && check.querySelector('input[type="checkbox"]');
      var qty = item.querySelector('[class*="_cart-number_"] input, [class*="_good-count_"] input');
      var spec = q(item, '_extra-select_');
      return {
        name: link ? (link.getAttribute('title') || text(link)) : '',
        sku: itemSku(href),
        url: href,
        image: imageUrl(item.querySelector('img')),
        price: parseMoney(titleOrText(q(item, '_price-normal_'))),
        quantity: qty ? (parseInt(qty.value, 10) || 1) : 1,
        selected: box ? !!box.checked : !!(check && q(check, '_checked_')),
        spec: spec ? (spec.getAttribute('title') || '') : '',
        shop: card ? text(q(card, '_title-txt_')) : '',
      };
    }).filter(function (item) { return item.name || item.sku; });
    var selected = items.filter(function (item) { return item.selected && typeof item.price === 'number'; });
    return {
      status: 'success',
      currentUrl: location.origin + location.pathname,
      totalItems: items.length,
      cartCount: parseMoney(text(q(document, '_cartNum_'))),
      // Unit price × quantity of the ticked items; JD's checkout may apply further discounts.
      selectedEstimate: Math.round(selected.reduce(function (sum, item) { return sum + item.price * item.quantity; }, 0) * 100) / 100,
      items: items,
    };
  }

  window.__jd_com_pages = {
    readOrders: readOrders,
    readSearch: readSearch,
    readCart: readCart,
    // Exposed for tests.
    parseMoney: parseMoney,
    statusCategory: statusCategory,
  };
})();
