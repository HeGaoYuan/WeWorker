/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,json,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const fetch=request;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const TRAIN_NO_RE = /^[0-9A-Za-z]{8,18}$/;
async function queryStops(cookieHeader, trainNo, fromCode, toCode, date, fetchImpl = fetch) {
    const url = `https://kyfw.12306.cn/otn/czxx/queryByTrainNo?train_no=${trainNo}&from_station_telecode=${fromCode}&to_station_telecode=${toCode}&depart_date=${date}`;
    const resp = await fetchImpl(url, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://kyfw.12306.cn/otn/leftTicket/init',
            'Cookie': cookieHeader,
        },
    });
    if (!resp.ok) {
        throw new CommandExecutionError(`12306 queryByTrainNo returned HTTP ${resp.status}`);
    }
    let json;
    try {
        json = await resp.json();
    } catch {
        throw new CommandExecutionError('12306 queryByTrainNo returned non-JSON body');
    }
    if (json?.status !== true || !Array.isArray(json?.data?.data)) {
        throw new CommandExecutionError(`12306 queryByTrainNo returned an unexpected payload shape`);
    }
    return json.data.data;
}
__webcliRegisterCommand("train",async (kwargs) => {
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

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const stations = await fetchStationBundle();
        const fromStation = resolveStation(stations, fromArg);
        const toStation = resolveStation(stations, toArg);
        if (fromStation.code === toStation.code) {
            throw new ArgumentError(`--from and --to must differ; both resolved to ${fromStation.name} (${fromStation.code})`);
        }

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/leftTicket/init');
        const cookieHeader = '';
        const stops = await queryStops(cookieHeader, trainNo, fromStation.code, toStation.code, date);
        if (stops.length === 0) {
            throw new EmptyResultError(`No stops returned for train_no=${trainNo} on ${date}`);
        }
        return stops.map((s) => ({
            station_no: s.station_no || '',
            station_name: s.station_name || '',
            arrive_time: s.arrive_time === '----' ? '' : (s.arrive_time || ''),
            start_time: s.start_time === '----' ? '' : (s.start_time || ''),
            stopover_time: s.stopover_time === '----' ? '' : (s.stopover_time || ''),
        }));
    });
})();
