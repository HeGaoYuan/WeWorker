/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const MAX_PAGE_SIZE=50;
__webcliRegisterCommand("passengers",async (kwargs = {}) => {

        const limit = normalizeLimit(kwargs.limit, 20, MAX_PAGE_SIZE);
        const include = boolean(kwargs['include-sensitive']);

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/view/index.html');

        const json = await window.__rail12306.json('/otn/passengers/query',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:"pageIndex=1&pageSize=50"});
        if (json?.__http) {
            if ([401, 403].includes(Number(json.__http))) {
                throw new AuthRequiredError('kyfw.12306.cn', '12306 passengers requires a valid login session');
            }
            throw new CommandExecutionError(`12306 returned HTTP ${json.__http} for passengers/query`);
        }
        if (json?.__parse) {
            throw new CommandExecutionError(`12306 passengers returned non-JSON body: ${json.__parse}`);
        }
        if (isAuthLikePayload(json)) {
            throw new AuthRequiredError('kyfw.12306.cn', '12306 passengers requires a valid login session');
        }
        if (json?.status !== true || !Array.isArray(json?.data?.datas)) {
            throw new CommandExecutionError('12306 passengers payload missing data.datas array');
        }
        const datas = json.data.datas;
        if (datas.length === 0) {
            throw new EmptyResultError('No saved passengers on this 12306 account');
        }
        return datas.slice(0, limit).map((p) => ({
            name: include ? (p.passenger_name || '') : maskChineseName(p.passenger_name || ''),
            sex: p.sex_name || '',
            born_year: include ? (p.born_date || '') : (p.born_date || '').slice(0, 4),
            id_type: p.passenger_id_type_name || '',
            id_no: p.passenger_id_no || '',
            mobile: include ? (p.mobile_no || '') : maskMobile(p.mobile_no || ''),
            passenger_type: p.passenger_type_name || '',
            country: p.country_code || '',
        }));
    });})();
