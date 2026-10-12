/* v2 command mail.google.com.search-emails; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("search-emails", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.search_emails", params || {});
  });
})();
