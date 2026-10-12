/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Changed: v2 registration, scoped backend request and strict CLI scalar validation. */
(function () {
  __webcliRegisterCommand("stations", async function (args = {}) {
    const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
    if (!keyword) fail('INVALID_ARGS', 'keyword must not be empty');
    const raw = args.limit === undefined ? 20 : args.limit;
    const limit = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail('INVALID_ARGS', 'limit must be an integer between 1 and 50');
    const url = 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js';
    const response = await window.__webmcpWecliRuntime.requestPrivileged('backend_fetch', {
      url, browserFallback: false, redactBodyInTrace: true, options: { method: 'GET', redirect: 'manual' }
    });
    if (!response.ok || response.redirected || response.url !== url) fail('HTTP_ERROR', '12306 station bundle request failed: HTTP ' + response.status);
    const match = response.body.match(/'([^']+)'/);
    if (!match) fail('PARSE_ERROR', '12306 station bundle has no station string');
    const stations = match[1].split('@').filter(Boolean).map(line => line.split('|')).filter(p => p.length >= 8 && /^[A-Z]{2,4}$/.test(p[2])).map(p => ({ name:p[1],code:p[2],pinyin:p[3],abbr:p[4],city:p[7],short:p[0] }));
    if (!stations.length) fail('PARSE_ERROR', '12306 station bundle has no station records');
    const lower = keyword.toLowerCase();
    const rows = stations.filter(s => s.name.includes(keyword) || s.code === keyword.toUpperCase() || s.pinyin.includes(lower) || s.abbr.includes(lower) || s.short.includes(lower) || s.city.includes(keyword));
    if (!rows.length) fail('EMPTY_RESULT', 'No matching 12306 stations');
    return rows.slice(0,limit).map(({short,...row}) => row);
  });
})();
