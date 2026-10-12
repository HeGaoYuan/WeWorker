/* v2 command github.com.search-repositories; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("search-repositories", async function (params) {
    return window["__github_com_internal"].invoke("github.com.search_repositories", params || {});
  });
})();
