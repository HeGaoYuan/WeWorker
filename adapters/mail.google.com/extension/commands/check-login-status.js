/* v2 command mail.google.com.check-login-status; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("check-login-status", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.check_login_status", params || {});
  });
})();
