/* v2 command jd.com.view-cart: opens the cart and lists its items in one call. */
(function () {
  __webcliRegisterCommand("view-cart", async function () {
    if (location.hostname !== "cart.jd.com") {
      return { __webcli_navigation: { version: 1, url: "https://cart.jd.com/cart_index", resume: true } };
    }
    return window.__jd_com_pages.readCart();
  });
})();
