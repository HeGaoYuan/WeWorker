/* v2 command mail.google.com.navigate-to-inbox; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("navigate-to-inbox", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.navigate_to_inbox", params || {});
  });
})();
