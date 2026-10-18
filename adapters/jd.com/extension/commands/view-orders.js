/* v2 command jd.com.view-orders; delegates to the preserved executable implementation. */
(function () {
  var ORDER_LIST_URL = "https://order.jd.com/center/list.action";
  __webcliRegisterCommand("view-orders", async function (params) {
    // One call: the host opens the order list and runs this read again there.
    // Without a session JD redirects to passport.jd.com, which starts the host's login flow.
    if (location.hostname !== "order.jd.com" || location.pathname.indexOf("/center/list.action") !== 0) {
      return { __webcli_navigation: { version: 1, url: ORDER_LIST_URL, resume: true } };
    }
    return window["__jd_com_internal"].invoke("jd.com.view_orders", params || {});
  });
})();
