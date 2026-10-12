(function () {
  __webcliRegisterCommand("hotel-suggest", async function (params) {
    return window.__ctrip_com_suggest(params, "H");
  });
})();
