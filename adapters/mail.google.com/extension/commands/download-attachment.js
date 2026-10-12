/* v2 command mail.google.com.download-attachment; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("download-attachment", async function (params) {
    return window["__mail_google_com_internal"].invoke("mail.google.com.download_attachment", params || {});
  });
})();
