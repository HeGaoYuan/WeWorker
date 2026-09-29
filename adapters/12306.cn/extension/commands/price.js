/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,json,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const fetch=request;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const TRAIN_NO_RE = /^[0-9A-Za-z]{8,18}$/;
const SEAT_TYPES_RE = /^[A-Z0-9]{1,32}$/;
const SEAT_LETTERS = {
    'A9': '商务座',
    'P': '特等座',
    'M': '一等座',
    'O': '二等座',
    'A1': '硬座',
    'A3': '硬卧',
    'A4': '软卧',
    'F': '动卧',
    'WZ': '无座',
};
async function queryStopsForPrice(cookieHeader, trainNo, fromCode, toCode, date, fetchImpl = fetch) {
    const url = `https://kyfw.12306.cn/otn/czxx/queryByTrainNo?train_no=${trainNo}&from_station_telecode=${fromCode}&to_station_telecode=${toCode}&depart_date=${date}`;
    const resp = await fetchImpl(url, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
            'Cookie': cookieHeader,
        },
    });
    if (!resp.ok) throw new CommandExecutionError(`12306 queryByTrainNo returned HTTP ${resp.status}`);
    let json;
    try {
        json = await resp.json();
    } catch {
        throw new CommandExecutionError('12306 queryByTrainNo returned non-JSON body');
    }
    if (json?.status !== true || !Array.isArray(json?.data?.data)) {
        throw new CommandExecutionError('12306 queryByTrainNo returned an unexpected payload shape');
    }
    return json.data.data;
}
function pickStationNos(stops, fromCode, toCode, fromName, toName) {
    const matches = (s, code, name) => (s.station_name && name && s.station_name === name);
    const fromStop = stops.find((s) => matches(s, fromCode, fromName));
    const toStop = stops.find((s) => matches(s, toCode, toName));
    if (!fromStop) throw new CommandExecutionError(`Train does not stop at ${fromName}`);
    if (!toStop) throw new CommandExecutionError(`Train does not stop at ${toName}`);
    return { fromNo: fromStop.station_no, toNo: toStop.station_no };
}
async function queryPrice(cookieHeader, trainNo, fromNo, toNo, seatTypes, date, fetchImpl = fetch) {
    const url = `https://kyfw.12306.cn/otn/leftTicket/queryTicketPrice?train_no=${trainNo}&from_station_no=${fromNo}&to_station_no=${toNo}&seat_types=${seatTypes}&train_date=${date}`;
    const resp = await fetchImpl(url, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
            'Cookie': cookieHeader,
        },
    });
    if (!resp.ok) throw new CommandExecutionError(`12306 queryTicketPrice returned HTTP ${resp.status}`);
    let json;
    try {
        json = await resp.json();
    } catch {
        throw new CommandExecutionError('12306 queryTicketPrice returned non-JSON body');
    }
    if (json?.status !== true || !json?.data) {
        throw new CommandExecutionError('12306 queryTicketPrice returned an unexpected payload shape');
    }
    return json.data;
}
function parsePriceData(priceData) {
    const rows = [];
    for (const [letter, value] of Object.entries(priceData)) {
        if (letter === 'train_no' || letter === 'OT') continue;
        if (typeof value !== 'string' || !value) continue;
        // 12306 doubles up some prices as bare numerics ("9": "21580"), which
        // mirror their letter sibling ("A9": "¥2158.0") in cents/no-decimal
        // form. Skip the bare numeric letter codes to avoid duplicates.
        if (/^\d+$/.test(letter)) continue;
        if (!/^[A-Z]/.test(letter)) continue;
        const numeric = value.replace(/^¥/, '');
        if (!/^[\d.]+$/.test(numeric)) continue;
        rows.push({
            seat_code: letter,
            seat_name: SEAT_LETTERS[letter] || letter,
            price: numeric,
            currency: 'CNY',
        });
    }
    rows.sort((a, b) => Number(b.price) - Number(a.price));
    return rows;
}
__webcliRegisterCommand("price",async (kwargs) => {
        const trainNo = String(kwargs['train-no'] ?? '').trim();
        if (!trainNo) throw new ArgumentError('<train-no> must not be empty');
        if (!TRAIN_NO_RE.test(trainNo)) {
            throw new ArgumentError(
                `<train-no> "${trainNo}" does not look like a 12306 internal train_no`,
                'Use the train_no field from `12306 trains` output (e.g. 24000000G10L), not the public code (G1).',
            );
        }
        const fromArg = String(kwargs.from ?? '').trim();
        const toArg = String(kwargs.to ?? '').trim();
        if (!fromArg) throw new ArgumentError('--from station must not be empty');
        if (!toArg) throw new ArgumentError('--to station must not be empty');
        const date = validateDate(kwargs.date);
        const seatTypes = String(kwargs['seat-types'] ?? '').trim() || 'OM9PA1A3A4FWZ';
        if (!SEAT_TYPES_RE.test(seatTypes)) {
            throw new ArgumentError('--seat-types must contain only 12306 seat letters/digits (A-Z, 0-9)');
        }

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const stations = await fetchStationBundle();
        const fromStation = resolveStation(stations, fromArg);
        const toStation = resolveStation(stations, toArg);
        if (fromStation.code === toStation.code) {
            throw new ArgumentError(`--from and --to must differ; both resolved to ${fromStation.name} (${fromStation.code})`);
        }

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const cookieHeader = '';
        const stops = await queryStopsForPrice(cookieHeader, trainNo, fromStation.code, toStation.code, date);
        const { fromNo, toNo } = pickStationNos(stops, fromStation.code, toStation.code, fromStation.name, toStation.name);
        const priceData = await queryPrice(cookieHeader, trainNo, fromNo, toNo, seatTypes, date);
        const rows = parsePriceData(priceData);
        if (rows.length === 0) {
            throw new EmptyResultError(
                `No prices returned for train_no=${trainNo} ${fromStation.name} -> ${toStation.name} on ${date}`,
                'Try a different seat-types letter set, or check that this train operates on the date.',
            );
        }
        return rows;
    });
})();
