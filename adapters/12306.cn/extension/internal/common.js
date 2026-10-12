/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){
class ArgumentError extends Error {code='INVALID_ARGS'}
class CommandExecutionError extends Error {code='COMMAND_EXEC'}
class EmptyResultError extends Error {code='EMPTY_RESULT'}
class AuthRequiredError extends Error {code='AUTH_REQUIRED';constructor(site,message){super(message||site)}}
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/; const STATION_CODE_RE=/^[A-Z]{2,4}$/;
function parseStationBundle(text) {
    const match = text.match(/'([^']+)'/);
    if (!match) {
        throw new CommandExecutionError('Failed to parse 12306 station_name.js: source string not found');
    }
    const raw = match[1];
    const records = raw.split('@').filter(Boolean);
    const stations = [];
    for (const r of records) {
        const parts = r.split('|');
        if (parts.length < 8 || !parts[2]) continue;
        stations.push({
            short: parts[0] || '',
            name: parts[1] || '',
            code: parts[2] || '',
            pinyin: parts[3] || '',
            abbr: parts[4] || '',
            city: parts[7] || '',
        });
    }
    if (stations.length === 0) {
        throw new CommandExecutionError('Failed to parse 12306 station_name.js: no station records found');
    }
    return stations;
}
function resolveStation(stations, input) {
    const trimmed = String(input ?? '').trim();
    if (!trimmed) throw new ArgumentError('station must not be empty');
    if (STATION_CODE_RE.test(trimmed)) {
        const exact = stations.find((s) => s.code === trimmed);
        if (exact) return exact;
        throw new ArgumentError(`Unknown 12306 station telecode "${trimmed}"`);
    }
    const lower = trimmed.toLowerCase();
    const exactName = stations.find((s) => s.name === trimmed);
    if (exactName) return exactName;
    const exactPinyin = stations.find((s) => s.pinyin === lower);
    if (exactPinyin) return exactPinyin;
    const exactAbbr = stations.find((s) => s.abbr === lower || s.short === lower);
    if (exactAbbr) return exactAbbr;
    throw new ArgumentError(`Unknown 12306 station "${trimmed}"`, 'Try the Chinese name (上海虹桥), the 3-4 letter telecode (AOH), or full pinyin (shanghaihongqiao).');
}
function validateDate(value) {
    if (!DATE_RE.test(String(value ?? ''))) {
        throw new ArgumentError(`date must be YYYY-MM-DD, got "${value}"`);
    }
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        throw new ArgumentError(`date "${value}" is not a real calendar date`);
    }
    return value;
}
function parseTrainRecord(line, stationByCode) {
    const f = line.split('|');
    if (f.length < 33) return null;
    return {
        train_no: f[2] || '',
        code: f[3] || '',
        from_station: stationByCode.get(f[6])?.name || f[6] || '',
        to_station: stationByCode.get(f[7])?.name || f[7] || '',
        from_code: f[6] || '',
        to_code: f[7] || '',
        start_time: f[8] || '',
        arrive_time: f[9] || '',
        duration: f[10] || '',
        available: (f[1] || '').trim() === '预订' || (f[11] || '').trim() === 'Y',
        business_seat: f[32] || '',
        first_seat: f[31] || '',
        second_seat: f[30] || '',
        soft_sleeper: f[23] || '',
        hard_sleeper: f[28] || '',
        hard_seat: f[29] || '',
        no_seat: f[26] || '',
    };
}
function maskEmail(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    const at = v.indexOf('@');
    if (at <= 0) return v;
    const local = v.slice(0, at);
    const domain = v.slice(at);
    if (local.length <= 2) return local[0] + '*' + domain;
    return local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local.slice(-1) + domain;
}
function maskMobile(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/\*/.test(v)) return v;
    if (v.length < 7) return v.replace(/.(?=.)/g, '*');
    return v.slice(0, 3) + '*'.repeat(v.length - 7) + v.slice(-4);
}
function maskChineseName(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (v.length === 1) return v;
    if (v.length === 2) return v[0] + '*';
    return v[0] + '*'.repeat(v.length - 2) + v.slice(-1);
}
function isAuthLikePayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const parts = [];
    if (Array.isArray(payload.messages)) parts.push(...payload.messages);
    if (payload.message) parts.push(payload.message);
    if (payload.msg) parts.push(payload.msg);
    if (payload.validateMessages && typeof payload.validateMessages === 'object') {
        parts.push(...Object.values(payload.validateMessages).flat());
    }
    const text = parts.map((item) => String(item ?? '')).join(' ');
    return /未登录|登录|请登录|身份|认证|session|Session|login/i.test(text);
}
function normalizeLimit(raw,fallback,max){const x=raw===undefined?fallback:raw;const n=typeof x==='string'&&/^\d+$/.test(x)?Number(x):x;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('limit must be an integer in 1..'+max);return n;}
function boolean(raw){if(raw===undefined||raw===false||raw==='false')return false;if(raw===true||raw==='true')return true;throw new ArgumentError('include-sensitive must be true or false');}
function navigate(url,resume=true){return {__webcli_navigation:{version:1,url,resume,...(resume?{}:{result:{status:'login_required',url,message:'Complete login manually, then call whoami.'}})}};}
function ready(){return location.origin==='https://kyfw.12306.cn'&&location.pathname.startsWith('/otn/')&&!/login/.test(location.pathname);}
async function request(url,options={}){const u=new URL(url,location.href);if(u.origin!=='https://kyfw.12306.cn')throw new CommandExecutionError('Unexpected request host'); const headers={'X-Requested-With':'XMLHttpRequest',...(options.headers||{})};delete headers.Cookie;delete headers['User-Agent'];delete headers.Referer; let response;try {response=await window.fetch(u.href,{...options,headers,credentials:'include',redirect:'error'});}catch{throw new CommandExecutionError('12306 request failed; cause unknown. Check the page and trace.');}return response;}
async function fetchStationBundle(){const r=await request('/otn/resources/js/framework/station_name.js');if(!r.ok)throw new CommandExecutionError('Station bundle HTTP '+r.status);return parseStationBundle(await r.text());}
async function json(url,options){const r=await request(url,options);if([401,403].includes(r.status))throw new AuthRequiredError('12306','Login or verification required');if(!r.ok)throw new CommandExecutionError('12306 HTTP '+r.status);let j;try{j=await r.json()}catch{throw new CommandExecutionError('12306 returned non-JSON; inspect page for login or captcha')}if(isAuthLikePayload(j))throw new AuthRequiredError('12306','Login expired');return j;}

window.__rail12306={ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,json,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload};
})();
