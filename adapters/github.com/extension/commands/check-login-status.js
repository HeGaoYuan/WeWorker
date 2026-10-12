/* v2 command github.com.check-login-status; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("check-login-status", async function (params) {
    return window["__github_com_internal"].invoke("github.com.check_login_status", params || {});
  });
})();
