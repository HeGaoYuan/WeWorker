/* v2 command github.com.star-current-repository; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("star-current-repository", async function (params) {
    return window["__github_com_internal"].invoke("github.com.star_current_repository", params || {});
  });
})();
