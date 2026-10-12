/* v2 command mail.google.com.get-current-page-info; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("get-current-page-info", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.get_current_page_info", params || {});
  });
})();
