/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){class CliError extends Error {constructor(code,message){super(message);this.code=code}}
class ArgumentError extends CliError{constructor(m){super('INVALID_ARGS',m)}}
class CommandExecutionError extends CliError{constructor(m){super('PARSE_ERROR',m)}}
class AuthRequiredError extends CliError{constructor(s,m){super('AUTH_REQUIRED',m||s)}}
class EmptyResultError extends CliError{constructor(m,h){super('EMPTY_RESULT',h||m)}}
function navigate(url){return {__webcli_navigation:{version:1,url,resume:true}}}function same(url){const a=new URL(location.href),b=new URL(url);return a.origin===b.origin&&a.pathname===b.pathname&&[...a.searchParams].length===[...b.searchParams].length&&[...b.searchParams].every(([k,v])=>a.searchParams.getAll(k).join('\0')===b.searchParams.getAll(k).join('\0'))}function integer(x,d,max){const r=x===undefined?d:x;const n=typeof r==='string'&&/^\d+$/.test(r)?Number(r):r;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('Integer outside range 1..'+max);return n}function guard(){const t=document.body?.innerText||'';if(/验证码|安全验证|滑动验证|访问验证/.test(t))throw new CliError('CAPTCHA_REQUIRED','Complete site verification in the connected browser');if(/请先登录|登录后查看/.test(t))throw new AuthRequiredError('Login required');}
const MIN_OFFSET = 7200; // 2 hours
const MAX_OFFSET = 14 * 86400; // 14 days
function validateTiming(unixSeconds) {
    if (!Number.isFinite(unixSeconds))
        throw new Error(`无效的时间戳: ${unixSeconds}`);
    const now = Math.floor(Date.now() / 1000);
    if (unixSeconds < now + MIN_OFFSET)
        throw new Error(`定时发布时间必须在至少 2 小时后`);
    if (unixSeconds > now + MAX_OFFSET)
        throw new Error(`定时发布时间不能超过 14 天`);
}
function toUnixSeconds(input) {
    if (typeof input === 'number')
        return input;
    if (/^\d+$/.test(input)) {
        return Number(input);
    }
    const ms = new Date(input).getTime();
    if (isNaN(ms))
        throw new Error(`无效的时间格式: "${input}"`);
    return Math.floor(ms / 1000);
}
async function fetchDouyinUserVideos(secUid, count) {
    const params = new URLSearchParams({
        sec_user_id: secUid,
        max_cursor: '0',
        count: String(count),
        aid: '6383',
    });
    const data = await browserFetch('GET', `https://www.douyin.com/aweme/v1/web/aweme/post/?${params.toString()}`, {
        headers: { referer: 'https://www.douyin.com/' },
    });
    return data.aweme_list || [];
}
async function fetchDouyinComments(awemeId, count) {
    const params = new URLSearchParams({
        aweme_id: awemeId,
        count: String(count),
        cursor: '0',
        aid: '6383',
    });
    const data = await browserFetch('GET', `https://www.douyin.com/aweme/v1/web/comment/list/?${params.toString()}`, {
        headers: { referer: 'https://www.douyin.com/' },
    });
    return (data.comments || []).slice(0, count).map((comment) => ({
        text: comment.text || '',
        digg_count: comment.digg_count ?? 0,
        nickname: comment.user?.nickname || '',
    }));
}
function bool(v,d){if(v===undefined)return d;if(v===true||v==='true')return true;if(v===false||v==='false')return false;throw new ArgumentError('Expected true or false')}
function list(res,key){if(!Array.isArray(res[key]))throw new CommandExecutionError('Douyin missing list field '+key);return res[key]}
async function browserFetch(method,url,options={}){const u=new URL(url);if(u.origin!==location.origin||!['www.douyin.com','creator.douyin.com'].includes(u.hostname))throw new CommandExecutionError('Douyin API origin mismatch');guard();const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),options.timeoutMs||30000);try{const r=await fetch(url,{method,credentials:'include',redirect:'error',headers:{'Content-Type':'application/json',...options.headers},...(options.body?{body:JSON.stringify(options.body)}:{}),signal:ctrl.signal});const t=await r.text();if([401,403].includes(r.status))throw new AuthRequiredError('douyin','Login or permission required');if(!r.ok)throw new CliError('HTTP_ERROR','Douyin HTTP '+r.status);if(!t.trim())throw new CommandExecutionError('Douyin returned an empty response; endpoint or signing status unknown');let j;try{j=JSON.parse(t.replace(/("(?:id|aweme_id|item_id|uid|mix_id|cid)"\s*:\s*)(\d{16,})/g,'$1"$2"'))}catch{throw new CommandExecutionError('Douyin returned non-JSON')}if(!j||typeof j!=='object'||Array.isArray(j))throw new CommandExecutionError('Malformed Douyin response');if(j.status_code!==undefined&&j.status_code!==0){const msg=j.status_msg||j.message||'Unknown';if(/captcha|verify|验证/i.test(msg))throw new CliError('CAPTCHA_REQUIRED','Complete verification');if(/login|cookie|auth|登录|权限/i.test(msg))throw new AuthRequiredError('douyin','Session or permission rejected');throw new CommandExecutionError('Douyin API code '+j.status_code+': '+msg)}return j;}finally{clearTimeout(timer)}}

window.__douyin={CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments};})();
