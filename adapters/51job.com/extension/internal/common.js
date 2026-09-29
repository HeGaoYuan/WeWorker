/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){class CliError extends Error {constructor(code,message){super(message);this.code=code}}
class ArgumentError extends CliError{constructor(m){super('INVALID_ARGS',m)}}
class CommandExecutionError extends CliError{constructor(m){super('PARSE_ERROR',m)}}
class AuthRequiredError extends CliError{constructor(s,m){super('AUTH_REQUIRED',m||s)}}
class EmptyResultError extends CliError{constructor(m,h){super('EMPTY_RESULT',h||m)}}
function navigate(url){return {__webcli_navigation:{version:1,url,resume:true}}}function same(url){const a=new URL(location.href),b=new URL(url);return a.origin===b.origin&&a.pathname===b.pathname&&[...a.searchParams].length===[...b.searchParams].length&&[...b.searchParams].every(([k,v])=>a.searchParams.getAll(k).join('\0')===b.searchParams.getAll(k).join('\0'))}function integer(x,d,max){const r=x===undefined?d:x;const n=typeof r==='string'&&/^\d+$/.test(r)?Number(r):r;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('Integer outside range 1..'+max);return n}function guard(){const t=document.body?.innerText||'';if(/验证码|安全验证|滑动验证|访问验证/.test(t))throw new CliError('CAPTCHA_REQUIRED','Complete site verification in the connected browser');if(/请先登录|登录后查看/.test(t))throw new AuthRequiredError('Login required');}
const WE_ORIGIN = 'https://we.51job.com';
const JOBS_ORIGIN = 'https://jobs.51job.com';
const CITY_CODES = {
    '全国': '000000', 'all': '000000',
    '北京': '010000', 'beijing': '010000',
    '上海': '020000', 'shanghai': '020000',
    '广州': '030200', 'guangzhou': '030200',
    '深圳': '040000', 'shenzhen': '040000',
    '武汉': '180200', 'wuhan': '180200',
    '西安': '200200', "xi'an": '200200', 'xian': '200200',
    '杭州': '080200', 'hangzhou': '080200',
    '南京': '070200', 'nanjing': '070200',
    '成都': '090200', 'chengdu': '090200',
    '苏州': '070300', 'suzhou': '070300',
    '重庆': '060000', 'chongqing': '060000',
    '天津': '050000', 'tianjin': '050000',
    '长沙': '190200', 'changsha': '190200',
    '郑州': '170200', 'zhengzhou': '170200',
    '青岛': '120300', 'qingdao': '120300',
    '合肥': '150200', 'hefei': '150200',
    '厦门': '110300', 'xiamen': '110300',
    '无锡': '070400', 'wuxi': '070400',
    '济南': '120200', 'jinan': '120200',
    '佛山': '030700', 'foshan': '030700',
    '东莞': '030800', 'dongguan': '030800',
    '宁波': '080300', 'ningbo': '080300',
    '福州': '110200', 'fuzhou': '110200',
    '昆明': '250200', 'kunming': '250200',
    '大连': '230300', 'dalian': '230300',
    '沈阳': '230200', 'shenyang': '230200',
    '哈尔滨': '220200', 'haerbin': '220200', 'harbin': '220200',
    '石家庄': '160200', 'shijiazhuang': '160200',
    '贵阳': '260200', 'guiyang': '260200',
    '南宁': '100200', 'nanning': '100200',
    '南昌': '130200', 'nanchang': '130200',
    '长春': '240200', 'changchun': '240200',
    '太原': '210200', 'taiyuan': '210200',
    '兰州': '280200', 'lanzhou': '280200',
    '乌鲁木齐': '310200', 'urumqi': '310200',
    '海口': '270200', 'haikou': '270200',
    '香港': '330000', 'hongkong': '330000', 'hk': '330000',
};
const SALARY_CODES = {
    '不限': '',
    '2千以下': '01', '2-3千': '02', '3-4.5千': '03',
    '4.5-6千': '04', '6-8千': '05', '8k-1万': '06', '8-10k': '06',
    '1-1.5万': '07', '10-15k': '07',
    '1.5-2万': '08', '15-20k': '08',
    '2-3万': '09', '20-30k': '09',
    '3-5万': '10', '30-50k': '10',
    '5万以上': '11', '50k以上': '11',
};
const WORKYEAR_CODES = {
    '不限': '',
    '在校生': '01', '应届': '02', '1年以下': '03',
    '1-3年': '04', '3-5年': '05', '5-7年': '06',
    '7-10年': '07', '10年以上': '08',
};
const DEGREE_CODES = {
    '不限': '',
    '初中及以下': '01', '高中/中技/中专': '02', '高中': '02',
    '大专': '03', '本科': '04', '硕士': '05', '博士': '06',
};
const COMPANY_TYPE_CODES = {
    '不限': '',
    '外资': '01', '欧美': '0101', '日韩': '0102',
    '合资': '02', '国企': '03', '民营': '04',
    '上市公司': '05', '创业公司': '06', '事业单位': '07',
    '非营利': '08', '政府': '09',
};
const COMPANY_SIZE_CODES = {
    '不限': '',
    '少于50': '01', '50以下': '01',
    '50-150': '02', '150-500': '03',
    '500-1000': '04', '1000-5000': '05',
    '5000-10000': '06', '10000以上': '07',
};
const SORT_CODES = {
    '综合': '0', 'relevance': '0', 'default': '0',
    '最新': '1', 'new': '1', 'newest': '1',
    '薪资': '2', 'salary': '2', 'pay': '2',
    '距离': '9', 'distance': '9',
};
function resolveCity(input) {
    if (!input) return '000000';
    const s = String(input).trim();
    if (!s || s === '全国' || s.toLowerCase() === 'all') return '000000';
    if (/^\d{6}$/.test(s)) return s;
    const key = s.toLowerCase();
    if (CITY_CODES[s] !== undefined) return CITY_CODES[s];
    if (CITY_CODES[key] !== undefined) return CITY_CODES[key];
    for (const [name, code] of Object.entries(CITY_CODES)) {
        if (typeof name === 'string' && name.includes(s)) return code;
    }
    throw new CliError('INVALID_ARGUMENT', `Unknown city/area "${s}"`, 'Use a supported city name like "杭州" or a 6-digit city code');
}
function resolveCode(input, table, fallback = '') {
    if (input === undefined || input === null || input === '') return fallback;
    const s = String(input).trim();
    if (table[s] !== undefined) return table[s];
    const key = s.toLowerCase();
    if (table[key] !== undefined) return table[key];
    if (Object.values(table).includes(s)) return s;
    for (const [k, v] of Object.entries(table)) {
        if (typeof k === 'string' && k.includes(s)) return v;
    }
    return fallback;
}
function buildSearchUrl(params) {
    const qs = new URLSearchParams();
    qs.set('api_key', '51job');
    qs.set('timestamp', String(Date.now()));
    qs.set('keyword', params.keyword ?? '');
    qs.set('searchType', '2');
    qs.set('function', params.function ?? '');
    qs.set('industry', params.industry ?? '');
    qs.set('jobArea', params.jobArea ?? '000000');
    qs.set('jobArea2', params.jobArea2 ?? '');
    qs.set('landmark', params.landmark ?? '');
    qs.set('metro', params.metro ?? '');
    qs.set('salary', params.salary ?? '');
    qs.set('workYear', params.workYear ?? '');
    qs.set('degree', params.degree ?? '');
    qs.set('companyType', params.companyType ?? '');
    qs.set('companySize', params.companySize ?? '');
    qs.set('jobType', params.jobType ?? '');
    qs.set('issueDate', params.issueDate ?? '');
    qs.set('sortType', params.sortType ?? '0');
    qs.set('pageNum', String(params.pageNum ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    qs.set('source', '1');
    qs.set('scene', '7');
    return `${WE_ORIGIN}/api/job/search-pc?${qs.toString()}`;
}
function mapJobItem(it, rank) {
    const area = it.jobAreaLevelDetail || {};
    return {
        rank,
        jobId: String(it.jobId ?? ''),
        title: it.jobName ?? '',
        salary: it.provideSalaryString ?? '',
        salaryMin: it.jobSalaryMin == null ? null : Number(it.jobSalaryMin),
        salaryMax: it.jobSalaryMax == null ? null : Number(it.jobSalaryMax),
        city: area.cityString ?? it.jobAreaString ?? '',
        district: area.districtString ?? '',
        workYear: it.workYearString ?? '',
        degree: it.degreeString ?? '',
        tags: Array.isArray(it.jobTags) ? it.jobTags.join(',') : '',
        company: it.companyName ?? '',
        companyFull: it.fullCompanyName ?? '',
        companyType: it.companyTypeString ?? '',
        companySize: it.companySizeString ?? '',
        industry: it.industryType1Str ?? '',
        hr: it.hrName ? `${it.hrName}·${it.hrPosition ?? ''}` : '',
        issueDate: it.issueDateString ?? '',
        url: it.jobHref ?? '',
        companyUrl: it.companyHref ?? '',
        encCoId: it.encCoId ?? '',
    };
}
const SEARCH_COLUMNS = [
    'rank', 'jobId', 'title', 'salary', 'salaryMin', 'salaryMax',
    'city', 'district', 'workYear', 'degree', 'tags',
    'company', 'companyFull', 'companyType', 'companySize', 'industry',
    'hr', 'issueDate', 'url', 'companyUrl', 'encCoId',
];
function parseCompanyJobCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const href = typeof raw.href === 'string' ? raw.href : '';
    const sensorsdata = typeof raw.sensorsdata === 'string' ? raw.sensorsdata : '';
    if (!href || !sensorsdata) return null;
    let data;
    try {
        data = JSON.parse(sensorsdata);
    } catch {
        return null;
    }
    if (!data || !data.jobId) return null;
    return {
        jobId: String(data.jobId),
        title: data.jobTitle || '',
        salary: data.jobSalary || '',
        city: data.jobArea || '',
        workYear: data.jobYear || '',
        degree: data.jobDegree || '',
        funcType: data.funcType || '',
        issueDate: data.jobTime || '',
        url: href,
    };
}
async function pageFetchJson(url){guard();const r=await window.__webmcpWecliRuntime.requestPrivileged('browser_fetch',{url,options:{method:'GET',redirect:'error',headers:{Accept:'application/json'}}});if(!r.ok)throw new CliError(r.status===401?'AUTH_REQUIRED':'HTTP_ERROR','51job HTTP '+r.status);const text=r.body||'';if(text.trim().startsWith('<'))throw new CliError('PARSE_ERROR','51job returned HTML instead of JSON; login, verification or page failure is unconfirmed');try{return JSON.parse(text)}catch{throw new CliError('PARSE_ERROR','51job invalid JSON')}}

window.__job51={CliError,ArgumentError,WE_ORIGIN,JOBS_ORIGIN,SALARY_CODES,WORKYEAR_CODES,DEGREE_CODES,COMPANY_TYPE_CODES,COMPANY_SIZE_CODES,SORT_CODES,buildSearchUrl,mapJobItem,resolveCity,resolveCode,parseCompanyJobCard,pageFetchJson,integer,navigate,same,guard};})();
