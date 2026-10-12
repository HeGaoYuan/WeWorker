/* v2 command github.com.get-repository-detail; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("get-repository-detail", async function (params) {
    return window["__github_com_internal"].invoke("github.com.get_repository_detail", params || {});
  });
})();
