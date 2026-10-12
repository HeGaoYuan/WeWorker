/* v2 command mail.google.com.open-email; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("open-email", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.open_email", params || {});
  });
})();
