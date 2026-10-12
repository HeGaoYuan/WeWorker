/* v2 command github.com.get-issue-or-pr-detail; delegates to the preserved executable implementation. */
(function () {
  __webcliRegisterCommand("get-issue-or-pr-detail", async function (params) {
    return window["__github_com_internal"].invoke("github.com.get_issue_or_pr_detail", params || {});
  });
})();
