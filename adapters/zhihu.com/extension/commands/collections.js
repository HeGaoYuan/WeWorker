/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
"use strict";
(() => {
  // port:errors
  var { CliError, ArgumentError, CommandExecutionError, AuthRequiredError, EmptyResultError } = window.__zhihu;

  // port:logger
  var log = { info() {
  }, debug() {
  }, warn() {
  } };

  // OpenCLI/clis/zhihu/collections.js
  var fetch = window.__zhihu.safeFetch;
  function validatePositiveInt(value, name) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ArgumentError(`zhihu collections --${name} must be a positive integer`, "Example: opencli zhihu collections --limit 20");
    }
    return n;
  }
  async function fetchJson(url, errorLabel) {
    const data = await ((__portValue0) => (async () => {
      const r = await fetch(__portValue0, { credentials: "include" });
      if (!r.ok) return { __httpError: r.status };
      return await r.json();
    })())(url);
    if (!data || data.__httpError) {
      const status = data?.__httpError;
      if (status === 401 || status === 403) {
        throw new AuthRequiredError("www.zhihu.com", `${errorLabel} from Zhihu failed. Please ensure you are logged in.`);
      }
      throw new CommandExecutionError(
        status ? `${errorLabel} from Zhihu failed (HTTP ${status})` : `${errorLabel} from Zhihu failed`,
        "Try again later or rerun with -v for more detail"
      );
    }
    return data;
  }
  function collectionKey(item) {
    return String(item?.id || item?.url || item?.title || "");
  }
  __webcliRegisterCommand("collections", async (args = {}) => {
    args = { ...{ "limit": 20 }, ...args };
    {
      const raw = args["limit"];
      if (typeof raw !== "number" && !(typeof raw === "string" && /^\d+$/.test(raw))) throw new window.__zhihu.ArgumentError("Invalid numeric argument");
      args["limit"] = Number(raw);
    }
    return (async (kwargs) => {
      const { limit = 20 } = kwargs;
      const requestedLimit = validatePositiveInt(limit, "limit");
      if (!window.__zhihu.ready("https://www.zhihu.com")) return window.__zhihu.navigate("https://www.zhihu.com");
      window.__zhihu.guard();
      const meData = await fetchJson("https://www.zhihu.com/api/v4/me?include=url_token", "Zhihu user info request");
      const urlToken = meData.url_token;
      if (!urlToken) {
        throw new CommandExecutionError("Failed to get user url_token from Zhihu", "Please ensure you are logged in.");
      }
      const collected = [];
      const seen = /* @__PURE__ */ new Set();
      let totals = 0;
      let offset = 0;
      const pageLimit = Math.min(requestedLimit, 20);
      const maxPages = Math.ceil(requestedLimit / pageLimit) + 2;
      for (let pageIndex = 0; pageIndex < maxPages && collected.length < requestedLimit; pageIndex += 1) {
        const currentFetchLimit = Math.min(pageLimit, requestedLimit - collected.length);
        const url = `https://www.zhihu.com/api/v4/people/${urlToken}/collections?include=data%5B*%5D.updated_time&offset=${offset}&limit=${currentFetchLimit}`;
        const data = await fetchJson(url, "Zhihu favorite collections request");
        const items = Array.isArray(data.data) ? data.data : [];
        const paging = data.paging || {};
        totals = Number(paging.totals || totals || 0);
        for (const item of items) {
          const key = collectionKey(item);
          if (key && !seen.has(key)) {
            seen.add(key);
            collected.push(item);
          }
          if (collected.length >= requestedLimit) break;
        }
        if (items.length === 0 || paging.is_end || collected.length >= requestedLimit) break;
        if (typeof paging.next === "string") {
          try {
            const nextUrl = new URL(paging.next);
            const parsedOffset = Number(nextUrl.searchParams.get("offset"));
            if (Number.isInteger(parsedOffset) && parsedOffset > offset) {
              offset = parsedOffset;
              continue;
            }
          } catch {
          }
        }
        if (items.length < currentFetchLimit) break;
        const fallbackOffset = offset + items.length;
        if (fallbackOffset <= offset) break;
        offset = fallbackOffset;
        if (totals && offset >= totals) break;
      }
      if (totals > 0) {
        log.info(`\u5171\u6709 ${totals} \u4E2A\u6536\u85CF\u5939`);
      }
      if (collected.length === 0) {
        throw new EmptyResultError("zhihu collections", "No favorite collections were returned for the logged-in user.");
      }
      return collected.slice(0, requestedLimit).map((item, i) => ({
        rank: i + 1,
        title: item.title || "\u672A\u547D\u540D",
        item_count: item.item_count ?? item.answer_count ?? null,
        description: item.description || "",
        collection_id: String(item.id || "")
      }));
    })(args);
  });
  var __test__ = {
    validatePositiveInt,
    collectionKey
  };
})();
