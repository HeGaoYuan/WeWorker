/* v2 command jd.com.search-products; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("search-products", async function (params) {
    var keyword = String((params && params.keyword) || "").trim();
    // One call: open the results page for this keyword, then parse it there.
    if (keyword && (location.hostname !== "search.jd.com" || new URLSearchParams(location.search).get("keyword") !== keyword)) {
      return { __webcli_navigation: { version: 1, url: "https://search.jd.com/Search?keyword=" + encodeURIComponent(keyword) + "&enc=utf-8", resume: true } };
    }
    return window["__jd_com_internal"].invoke("jd.com.search_products", params || {});
  });
})();
