/* v2 command mail.google.com.get-unread-emails; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("get-unread-emails", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.get_unread_emails", params || {});
  });
})();
