/* v2 command jd.com.navigate-to-homepage: the host opens the homepage and returns when it has loaded. */
(function () {
  __webcliRegisterCommand("navigate-to-homepage", async function () {
    if (location.hostname === "www.jd.com" && (location.pathname === "/" || location.pathname === "")) {
      return { status: "success", currentUrl: location.href };
    }
    return { __webcli_navigation: { version: 1, url: "https://www.jd.com/", resume: false, result: { status: "success", currentUrl: "https://www.jd.com/" } } };
  });
})();
