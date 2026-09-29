/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,json,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const fetch=request;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const QUERY_ENDPOINTS = ['queryG', 'queryO', 'queryZ', 'queryA'];
const MAX_LIMIT = 100;
const QUERY_ENDPOINT_RE = /^query[A-Z]$/;
function extractQueryEndpoint(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const direct = raw.replace(/^leftTicket\//, '').trim();
    if (QUERY_ENDPOINT_RE.test(direct)) return direct;
    try {
        const url = new URL(raw, 'https://kyfw.12306.cn');
        if (url.hostname !== 'kyfw.12306.cn') return '';
        const match = url.pathname.match(/\/leftTicket\/(query[A-Z])$/);
        return match ? match[1] : '';
    }
    catch {
        return '';
    }
}
async function parseRotationEndpoint(resp, endpoint, bodyText) {
    let json;
    if (bodyText) {
        try { json = JSON.parse(bodyText); } catch { /* body may be HTML on non-rotation redirects */ }
    }
    const bodyEndpoint = extractQueryEndpoint(json?.c_url);
    if (bodyEndpoint) return bodyEndpoint;
    const locationEndpoint = extractQueryEndpoint(resp.headers?.get?.('location'));
    if (locationEndpoint) return locationEndpoint;
    if (resp.status === 302) {
        throw new CommandExecutionError(`12306 ${endpoint} redirected without a leftTicket query endpoint`);
    }
    if (json?.c_url) {
        throw new CommandExecutionError(`12306 ${endpoint} returned an invalid rotation endpoint`);
    }
    return '';
}
async function queryLeftTickets(cookieHeader, fromCode, toCode, date) {
    const headers = {
        'User-Agent': UA,
        'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
        'Cookie': cookieHeader,
    };
    const queryParams = `leftTicketDTO.train_date=${date}&leftTicketDTO.from_station=${fromCode}&leftTicketDTO.to_station=${toCode}&purpose_codes=ADULT`;
    let lastResponseText = '';
    const queue = [...QUERY_ENDPOINTS];
    const tried = new Set();
    while (queue.length > 0) {
        const endpoint = queue.shift();
        if (tried.has(endpoint)) continue;
        tried.add(endpoint);
        const url = `https://kyfw.12306.cn/otn/leftTicket/${endpoint}?${queryParams}`;
        const resp = await fetch(url, { headers, redirect: 'manual' });
        if (!resp.ok) {
            if (resp.status === 302) {
                const body = await resp.text();
                const rotated = await parseRotationEndpoint(resp, endpoint, body);
                if (rotated && !tried.has(rotated)) {
                    queue.unshift(rotated);
                }
                continue;
            }
            throw new CommandExecutionError(`12306 ${endpoint} returned HTTP ${resp.status}`);
        }
        const text = await resp.text();
        lastResponseText = text;
        let json;
        try { json = JSON.parse(text); } catch {
            throw new CommandExecutionError(`12306 ${endpoint} returned non-JSON body`);
        }
        if (json?.c_url && typeof json.c_url === 'string') {
            const rotated = await parseRotationEndpoint(resp, endpoint, text);
            if (rotated && !tried.has(rotated)) {
                queue.unshift(rotated);
            }
            continue;
        }
        if (Array.isArray(json?.data?.result)) {
            return json.data.result;
        }
        throw new CommandExecutionError(`12306 ${endpoint} returned an unexpected payload shape`);
    }
    throw new CommandExecutionError(`12306 rejected every known query endpoint name (${QUERY_ENDPOINTS.join(', ')}); the wire protocol may have changed. Response content omitted`);
}
__webcliRegisterCommand("trains",async (kwargs) => {
        const fromArg = String(kwargs.from ?? '').trim();
        const toArg = String(kwargs.to ?? '').trim();
        if (!fromArg) throw new ArgumentError('<from> station must not be empty');
        if (!toArg) throw new ArgumentError('<to> station must not be empty');
        const date = validateDate(kwargs.date);
        const limit = normalizeLimit(kwargs.limit, 50, MAX_LIMIT);

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const stations = await fetchStationBundle();
        const fromStation = resolveStation(stations, fromArg);
        const toStation = resolveStation(stations, toArg);
        if (fromStation.code === toStation.code) {
            throw new ArgumentError(`<from> and <to> must differ; both resolved to ${fromStation.name} (${fromStation.code})`);
        }
        const stationByCode = new Map(stations.map((s) => [s.code, s]));

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const cookieHeader = '';
        const rawRows = await queryLeftTickets(cookieHeader, fromStation.code, toStation.code, date);
        const decoded = rawRows
            .map((line) => parseTrainRecord(decodeURIComponent(line.replace(/%0A/g, '')), stationByCode))
            .filter(Boolean);

        if (decoded.length === 0) {
            throw new EmptyResultError(
                `No trains found from ${fromStation.name} to ${toStation.name} on ${date}`,
                'Try a different date or check whether the route is operated by 12306.',
            );
        }
        return decoded.slice(0, limit);
    });
})();
