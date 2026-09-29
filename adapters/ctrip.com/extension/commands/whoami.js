(function () {
  __webcliRegisterCommand("whoami", (params) => window.__ctrip_com_auth.whoami(params || {}));
})();
