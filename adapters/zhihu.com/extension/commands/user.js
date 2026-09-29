/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
"use strict";
(() => {
  // port:errors
  var { CliError, ArgumentError, CommandExecutionError, AuthRequiredError, EmptyResultError } = window.__zhihu;

  // OpenCLI/clis/zhihu/user-arg.js
  var fetch = window.__zhihu.safeFetch;
  var SLUG_RE = /^[A-Za-z0-9_-]+$/;
  var USER_PREFIX_RE = /^user:([A-Za-z0-9_-]+)$/;
  var PEOPLE_PATH_RE = /^\/people\/([A-Za-z0-9_-]+)\/?$/;
  function parseZhihuUser(input) {
    const value = String(input ?? "").trim();
    if (!value) {
      throw new CliError("INVALID_INPUT", "A Zhihu user is required", "Example: opencli zhihu user wen-jie-16-47");
    }
    const prefixMatch = value.match(USER_PREFIX_RE);
    if (prefixMatch) return prefixMatch[1];
    if (SLUG_RE.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname === "www.zhihu.com") {
        const m = url.pathname.match(PEOPLE_PATH_RE);
        if (m) return m[1];
      }
    } catch {
    }
    throw new CliError(
      "INVALID_INPUT",
      `Invalid Zhihu user: ${value}`,
      "Use a url_token (wen-jie-16-47) or a people URL (https://www.zhihu.com/people/wen-jie-16-47)"
    );
  }

  // OpenCLI/clis/zhihu/paginate.js
  var fetch2 = window.__zhihu.safeFetch;
  function unwrapEvaluateResult(payload) {
    if (payload && typeof payload === "object" && "data" in payload && "session" in payload) return payload.data;
    return payload;
  }

  // OpenCLI/clis/zhihu/user.js
  var fetch3 = window.__zhihu.safeFetch;
  var INCLUDE = "follower_count,following_count,answer_count,articles_count,question_count,voteup_count,thanked_count,favorited_count,headline,gender";
  __webcliRegisterCommand("user", async (args = {}) => {
    args = { ...{}, ...args };
    return (async (kwargs) => {
      const slug = parseZhihuUser(kwargs.user);
      if (!window.__zhihu.ready("https://www.zhihu.com")) return window.__zhihu.navigate("https://www.zhihu.com");
      window.__zhihu.guard();
      const apiUrl = `https://www.zhihu.com/api/v4/members/${encodeURIComponent(slug)}?include=${encodeURIComponent(INCLUDE)}`;
      const data = unwrapEvaluateResult(await ((__portValue0) => (async () => {
        try {
          const r = await fetch3(__portValue0, { credentials: "include" });
          if (!r.ok) return { __httpError: r.status };
          return await r.json();
        } catch (err) {
          return { __fetchError: err?.message || String(err) };
        }
      })())(apiUrl));
      if (!data || typeof data !== "object" || Array.isArray(data) || data.__httpError || data.__fetchError) {
        const status = data?.__httpError;
        if (status === 401 || status === 403) {
          throw new AuthRequiredError("www.zhihu.com", "Failed to fetch Zhihu user profile");
        }
        if (status === 404) {
          throw new EmptyResultError("zhihu user", `No Zhihu user was found for ${slug}.`);
        }
        throw new CommandExecutionError(status ? `Zhihu user request failed (HTTP ${status})` : "Zhihu user request failed", data?.__fetchError ? String(data.__fetchError) : "Try again later or rerun with -v");
      }
      if (!data.url_token || !data.id || !data.name) {
        throw new CommandExecutionError("Zhihu user response missing identity fields", "Zhihu may have changed its API shape");
      }
      return [{
        url_token: String(data.url_token || ""),
        name: String(data.name || ""),
        headline: String(data.headline || ""),
        followers: data.follower_count ?? null,
        following: data.following_count ?? null,
        answers: data.answer_count ?? null,
        articles: data.articles_count ?? null,
        voteup: data.voteup_count ?? null,
        url: data.url_token ? `https://www.zhihu.com/people/${data.url_token}` : ""
      }];
    })(args);
  });
})();
