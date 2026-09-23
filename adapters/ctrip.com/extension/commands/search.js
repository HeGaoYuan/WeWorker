(function () {
  __webcliRegisterCommand("search", async function (params) {
    return window.__ctrip_com_suggest(params, "D");
  });
})();
