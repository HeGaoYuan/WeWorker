(function () {
  __webcliRegisterCommand("destination-search", async function (params) {
    const common = window.__ctrip_com_common;
    const query = typeof params?.query === "string" ? params.query.trim() : "";
    if (!query) common.fail("INVALID_ARGS", "query must be a non-empty string");
    const limit = common.integer("limit", params?.limit, 15, 1, 50);
    const url = "https://m.ctrip.com/restapi/h5api/globalsearch/search?action=gsonline&source=globalonline&keyword=" + encodeURIComponent(query);
    let response;
    try {
      response = await window.__webmcpWecliRuntime.requestPrivileged("backend_fetch", {
        url, browserFallback: false, redactBodyInTrace: true,
        options: { method: "GET", redirect: "manual" }
      });
    } catch { common.fail("FETCH_ERROR", "Ctrip destination search request failed"); }
    if (!response?.ok || response.redirected || response.url !== url) common.fail("HTTP_ERROR", "Ctrip destination search failed or redirected");
    let payload;
    try { payload = JSON.parse(response.body); } catch { common.fail("COMMAND_EXEC", "Ctrip destination search returned invalid JSON"); }
    if (!Array.isArray(payload?.data)) common.fail("COMMAND_EXEC", "Ctrip destination search response has no data array");
    const rows = payload.data.filter(item => item?.type === "district" && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.word === "string" && item.word.trim()).slice(0, limit).map((item, index) => ({
      rank: index + 1, name: item.word.trim(), destinationId: item.id,
      hotelCityId: Number.isSafeInteger(item.cityId) && item.cityId > 0 ? item.cityId : null,
      region: typeof item.districtName === "string" ? item.districtName : null,
      url: "https://you.ctrip.com/place/" + item.id + ".html"
    }));
    if (!rows.length) common.fail("EMPTY_RESULT", "No matching Ctrip destinations");
    return rows;
  });
})();
