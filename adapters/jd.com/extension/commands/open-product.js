/* v2 command jd.com.open-product: the host opens the product page and returns when it has loaded. */
(function () {
  __webcliRegisterCommand("open-product", async function (params) {
    var raw = String((params && params.url) || "").trim();
    var sku = String((params && params.sku) || "").replace(/\D/g, "");
    var url;
    try {
      url = raw ? new URL(raw.indexOf("//") === 0 ? "https:" + raw : raw) : sku ? new URL("https://item.jd.com/" + sku + ".html") : null;
    } catch (e) { url = null; }
    if (!url || !/^item\.jd\.(com|hk)$/.test(url.hostname)) {
      return { error: "Invalid URL", message: "需要京东商品页地址（item.jd.com/<SKU>.html）或 sku。" };
    }
    url.protocol = "https:";
    if (location.href.split("#")[0] === url.href) return { status: "success", productUrl: url.href };
    return { __webcli_navigation: { version: 1, url: url.href, resume: false, result: { status: "success", productUrl: url.href } } };
  });
})();
