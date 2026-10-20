/* v2 command jd.com.search-products: opens the results for a keyword and reads them in one call. */
(function () {
  __webcliRegisterCommand("search-products", async function (params) {
    var keyword = String((params && params.keyword) || "").trim();
    if (!keyword) return { error: "Missing required parameter", message: "keyword parameter is required" };
    if (location.hostname !== "search.jd.com" || new URLSearchParams(location.search).get("keyword") !== keyword) {
      return { __webcli_navigation: { version: 1, url: "https://search.jd.com/Search?keyword=" + encodeURIComponent(keyword) + "&enc=utf-8", resume: true } };
    }
    return window.__jd_com_pages.readSearch(params || {});
  });
})();
