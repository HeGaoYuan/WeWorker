/* v2 command jd.com.view-orders: reads JD's order center (order.jd.com, or order.jd.hk for some accounts). */
(function () {
  var ORDER_LIST_URL = "https://order.jd.com/center/list.action";
  __webcliRegisterCommand("view-orders", async function (params) {
    // One call: the host opens the order list and runs this read again there.
    // Without a session JD redirects to passport.jd.com, which starts the host's login flow.
    var onOrderList = /^order\.jd\.(com|hk)$/.test(location.hostname) && location.pathname.indexOf("/center/list.action") === 0;
    if (!onOrderList) {
      return { __webcli_navigation: { version: 1, url: ORDER_LIST_URL, resume: true } };
    }
    var result = await window.__jd_com_pages.readOrders(params || {});
    if (result) return result;
    // Older order pages (tbody rows) keep the original reader.
    return window["__jd_com_internal"].invoke("jd.com.view_orders", params || {});
  });
})();
