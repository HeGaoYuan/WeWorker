/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){class CliError extends Error {constructor(code,message){super(message);this.code=code}}
class ArgumentError extends CliError{constructor(m){super('INVALID_ARGS',m)}}
class CommandExecutionError extends CliError{constructor(m){super('PARSE_ERROR',m)}}
class AuthRequiredError extends CliError{constructor(s,m){super('AUTH_REQUIRED',m||s)}}
class EmptyResultError extends CliError{constructor(m,h){super('EMPTY_RESULT',h||m)}}
function navigate(url){return {__webcli_navigation:{version:1,url,resume:true}}}function same(url){const a=new URL(location.href),b=new URL(url);return a.origin===b.origin&&a.pathname===b.pathname&&[...a.searchParams].length===[...b.searchParams].length&&[...b.searchParams].every(([k,v])=>a.searchParams.getAll(k).join('\0')===b.searchParams.getAll(k).join('\0'))}function integer(x,d,max){const r=x===undefined?d:x;const n=typeof r==='string'&&/^\d+$/.test(r)?Number(r):r;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('Integer outside range 1..'+max);return n}function guard(){const t=document.body?.innerText||'';if(/验证码|安全验证|滑动验证|访问验证/.test(t))throw new CliError('CAPTCHA_REQUIRED','Complete site verification in the connected browser');if(/请先登录|登录后查看/.test(t))throw new AuthRequiredError('Login required');}
const BOSS_DOMAIN = 'www.zhipin.com';
const CHAT_URL = `https://${BOSS_DOMAIN}/web/chat/index`;
const COOKIE_EXPIRED_CODES = new Set([7, 37]);
const COOKIE_EXPIRED_MSG = 'Cookie 已过期！请在当前 Chrome 浏览器中重新登录 BOSS 直聘。';
const AMBIGUOUS_AUTH_CODE = 37;
const ENVIRONMENT_REJECTED_MARKERS = ['环境存在异常', '环境异常', 'abnormal environment'];
const RECRUITER_ONLY_MSG = '该命令仅支持招聘端（BOSS 端）账号，请使用招聘者账号登录后重试。';
const DEFAULT_TIMEOUT = 15_000;
function readPositiveInteger(raw, name, fallback, max) {
    const value = integer(raw,fallback,max || 1000);
    if (!Number.isInteger(value) || value < 1) {
        throw new ArgumentError(`boss ${name} must be a positive integer`);
    }
    if (max !== undefined && value > max) {
        throw new ArgumentError(`boss ${name} must be <= ${max}`);
    }
    return value;
}
function readRequiredString(raw, name) {
    const value = String(raw ?? '').trim();
    if (!value) {
        throw new ArgumentError(`boss ${name} cannot be empty`);
    }
    return value;
}
function checkAuth(data) {
    if (COOKIE_EXPIRED_CODES.has(data.code)) {
        throw new AuthRequiredError(BOSS_DOMAIN, COOKIE_EXPIRED_MSG);
    }
}
function checkEnvironment(data) {
    const message = String(data.message || '').toLowerCase();
    if (data.code === AMBIGUOUS_AUTH_CODE &&
        ENVIRONMENT_REJECTED_MARKERS.some((marker) => message.includes(marker.toLowerCase()))) {
        throw new CommandExecutionError(`Boss rejected the current browser environment: ${data.message || 'Unknown error'} (code=${data.code})`, '重新登录通常无法解决此问题。请保留当前页面，稍后重试，并在问题持续时上报完整错误信息。');
    }
}
function checkRecruiterSide(data) {
    if (data.code === IDENTITY_MISMATCH_CODE) {
        throw new AuthRequiredError(BOSS_DOMAIN, RECRUITER_ONLY_MSG);
    }
}
function assertOk(data, errorPrefix) {
    if (!data || typeof data !== 'object') {
        throw new CommandExecutionError(`${errorPrefix ? `${errorPrefix}: ` : ''}Boss API returned malformed response`);
    }
    if (data.code === 0)
        return;
    checkEnvironment(data);
    checkAuth(data);
    checkRecruiterSide(data);
    const prefix = errorPrefix ? `${errorPrefix}: ` : '';
    throw new CommandExecutionError(`${prefix}${data.message || 'Unknown error'} (code=${data.code})`);
}
async function fetchFriendList(opts = {}) {
    const pageNum = opts.pageNum ?? 1;
    const jobId = opts.jobId ?? '0';
    const url = `https://${BOSS_DOMAIN}/wapi/zprelation/friend/getBossFriendListV2.json?page=${pageNum}&status=0&jobId=${jobId}`;
    const data = await bossFetch(url, { allowNonZero: opts.allowNonZero });
    if (opts.allowNonZero && data.code !== 0) return data;
    const list = data.zpData?.friendList;
    if (!Array.isArray(list)) {
        throw new CommandExecutionError('Boss friend list response did not include zpData.friendList');
    }
    return list;
}
async function fetchRecommendList() {
    const url = `https://${BOSS_DOMAIN}/wapi/zprelation/friend/greetRecSortList`;
    const data = await bossFetch(url);
    const list = data.zpData?.friendList;
    if (!Array.isArray(list)) {
        throw new CommandExecutionError('Boss recommend response did not include zpData.friendList');
    }
    return list;
}
async function findFriendByUid(encryptUid, opts = {}) {
    const maxPages = opts.maxPages ?? 1;
    const checkGreetList = opts.checkGreetList ?? false;
    // Search friend list pages
    for (let p = 1; p <= maxPages; p++) {
        const result = await fetchFriendList({ pageNum: p, allowNonZero: opts.allowNonZero });
        if (opts.allowNonZero && !Array.isArray(result)) {
            return { friend: null, code: result.code };
        }
        const friends = Array.isArray(result) ? result : [];
        const found = friends.find((f) => f.encryptUid === encryptUid);
        if (found)
            return opts.allowNonZero ? { friend: found, code: 0 } : found;
        if (friends.length === 0)
            break;
    }
    // Optionally check greet list
    if (checkGreetList) {
        const greetList = await fetchRecommendList();
        const found = greetList.find((f) => f.encryptUid === encryptUid);
        if (found)
            return opts.allowNonZero ? { friend: found, code: 0 } : found;
    }
    return opts.allowNonZero ? { friend: null, code: 0 } : null;
}
async function clickCandidateInList(numericUid) {
    const uid = String(numericUid ?? '');
    if (!/^\d+$/.test(uid)) throw new ArgumentError('Candidate numeric uid is invalid');
    const result = await ((__portValue0)=>(
    async () => {
      const uid = __portValue0;
      const item = document.querySelector('#_' + uid + '-0') || document.querySelector('[data-uid="' + uid + '"]');
      if (item) {
        item.click();
        return { clicked: true };
      }
      const items = document.querySelectorAll('.geek-item');
      for (const el of items) {
        if (el.id && el.id === '_' + uid + '-0') {
          el.click();
          return { clicked: true };
        }
      }
      return { clicked: false };
    }
  )())(uid);
    return result.clicked;
}
async function typeAndSendMessage(text, numericUid) {
    const uid=String(numericUid ?? '');
    if (!/^\d+$/.test(uid)) throw new ArgumentError('Candidate uid is required');
    // A click or matching name alone does not prove the active recipient.
    const pane=document.querySelector('.chat-conversation[data-uid="'+uid+'"]') || document.querySelector('.conversation[data-uid="'+uid+'"]');
    if (!pane) throw new CliError('TARGET_UNVERIFIED','Cannot verify active conversation uid; no message was typed or sent');
    const typed = await ((__portValue0,__portValue1)=>(
    async () => {
      const selectors = [
        '.chat-editor [contenteditable="true"]',
        '.chat-input [contenteditable="true"]',
        '.message-editor [contenteditable="true"]',
        '.chat-conversation [contenteditable="true"]',

      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.focus();
          if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            el.value = __portValue0;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            el.textContent = '';
            el.focus();
            document.execCommand('insertText', false, __portValue1);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return { found: true };
        }
      }
      return { found: false };
    }
  )())(text,text);
    if (!typed.found)
        return false;

    // Click send button
    const sent = await (
    async () => {
      const btn = document.querySelector('.conversation-editor .submit')
               || document.querySelector('.submit-content .submit')
               || document.querySelector('.conversation-operate .submit');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    }
  )();
    if (!sent.clicked) {
        return false;
    }
    return true;
}
const IDENTITY_MISMATCH_CODE = 24;
const GEEK_CHAT_URL = `https://${BOSS_DOMAIN}/web/geek/chat`;
async function readEncryptSystemId() {
    const extract = () => (
    (() => {
      // 1. Vue app state / Pinia / $route.query
      // The chat component reads encryptSystemId from the app runtime to build
      // its own geekFilterByLabel request, so the value lives in the Vue tree.
      try {
        const appEl = document.querySelector('#app') || document.querySelector('[data-v-app]');
        const vueApp = appEl && (appEl.__vue_app__ || appEl._vei);
        if (vueApp) {
          // 1a. Pinia stores (Vue 3 standard state management on BOSS直聘)
          const pinia = vueApp.config && vueApp.config.globalProperties.$pinia;
          if (pinia && pinia.state && pinia.state.value) {
            for (const store of Object.values(pinia.state.value)) {
              try {
                const flat = JSON.stringify(store);
                if (flat.includes('encryptSystemId')) {
                  const m = flat.match(/"encryptSystemId":"([^"]+)"/);
                  if (m) return m[1];
                }
              } catch (_) {}
            }
          }
          // 1b. Vue Router current route query
          const router = vueApp.config && vueApp.config.globalProperties.$router;
          const query = router && router.currentRoute && router.currentRoute.value && router.currentRoute.value.query;
          if (query && query.encryptSystemId) return query.encryptSystemId;
        }
      } catch (_) {}
      // 2. Performance resource entries — the page already issued geekFilterByLabel
      // with encryptSystemId in the URL; read it back from the resource timing API.
      try {
        const entries = performance.getEntriesByType('resource');
        for (const entry of entries) {
          if (!entry.name.includes('geekFilterByLabel')) continue;
          const u = new URL(entry.name);
          const v = u.searchParams.get('encryptSystemId');
          if (v) return v;
        }
      } catch (_) {}
      // 3. cookie
      try {
        const m = document.cookie.match(/encryptSystemId=([^;]+)/i);
        if (m) return decodeURIComponent(m[1]);
      } catch (_) {}
      // 4. inline <script> SSR state (Nuxt embeds server state here)
      try {
        for (const s of document.querySelectorAll('script:not([src])')) {
          const t = s.textContent || '';
          if (!t.includes('encryptSystemId')) continue;
          const m = t.match(/"encryptSystemId":"([^"]+)"/);
          if (m) return m[1];
        }
      } catch (_) {}
      // 5. known BOSS / Nuxt window globals
      const KNOWN = [
        '__NUXT__', '__INITIAL_STATE__', '__ZP_INFO__', '__BOSS_ZP__',
        'pageGlobalVar', 'ZP_DATA', '__ZP_DATA__', '__PAGE_DATA__',
      ];
      for (const k of KNOWN) {
        const obj = window[k];
        if (!obj || typeof obj !== 'object') continue;
        try {
          const flat = JSON.stringify(obj);
          if (!flat.includes('encryptSystemId')) continue;
          const m = flat.match(/"encryptSystemId":"([^"]+)"/);
          if (m) return m[1];
        } catch (_) {}
      }
      // 6. localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.toLowerCase().includes('encryptsystemid')) {
            const v = localStorage.getItem(k);
            if (v) return v;
          }
          const v = localStorage.getItem(k) || '';
          if (v.includes('encryptSystemId')) {
            const m = v.match(/"encryptSystemId":"([^"]+)"/);
            if (m) return m[1];
          }
        }
      } catch (_) {}
      return '';
    })()
  );
    const result = (await window.__webmcpWecliRuntime.requestPrivileged('main_world_eval', { expression: '('+extract.toString()+')()' })).value;
    return result || '';
}
async function fetchGeekFriendLabelList(opts = {}) {
    const labelId = opts.labelId ?? 0;
    const encryptSystemId = opts.encryptSystemId ?? '';
    const url = `https://${BOSS_DOMAIN}/wapi/zprelation/friend/geekFilterByLabel?labelId=${labelId}&encryptSystemId=${encodeURIComponent(encryptSystemId)}`;
    const data = await bossFetch(url, { allowNonZero: opts.allowNonZero });
    if (opts.allowNonZero && data.code !== 0) return data;
    const list = data.zpData?.friendList;
    if (!Array.isArray(list)) {
        throw new CommandExecutionError('Boss geek chat list response did not include zpData.friendList');
    }
    return list;
}
async function fetchGeekFriendInfoList(friendIds = []) {
    if (!friendIds.length) return [];
    const BATCH_SIZE = 50;
    const results = [];
    for (let i = 0; i < friendIds.length; i += BATCH_SIZE) {
        const batch = friendIds.slice(i, i + BATCH_SIZE).map(String);
        const body = `friendIds=${batch.join(',')}`;
        const data = await bossFetch(`https://${BOSS_DOMAIN}/wapi/zprelation/friend/getGeekFriendList.json`, {
            method: 'POST',
            body,
        });
        const batchResult = data.zpData?.result;
        if (!Array.isArray(batchResult)) {
            throw new CommandExecutionError('Boss geek friend enrichment response did not include zpData.result');
        }
        results.push(...batchResult);
    }
    return results;
}
async function findGeekFriendByUid(encryptUid, opts = {}) {
    const labelList = await fetchGeekFriendLabelList({ encryptSystemId: opts.encryptSystemId });
    const candidate = labelList.find((f) => f.encryptFriendId === encryptUid ||
        String(f.uid) === String(encryptUid) ||
        String(f.friendId) === String(encryptUid));
    if (!candidate) return null;
    const enriched = await fetchGeekFriendInfoList([candidate.friendId]);
    return { ...candidate, ...(enriched[0] || {}) };
}
async function fetchGeekHistoryMsg(friend, opts = {}) {
    const pageNum = opts.page ?? 1;
    const bossId = friend.uid;
    const securityId = encodeURIComponent(friend.securityId || '');
    const url = `https://${BOSS_DOMAIN}/wapi/zpchat/geek/historyMsg?bossId=${bossId}&securityId=${securityId}&page=${pageNum}&c=20&src=0`;
    const data = await bossFetch(url);
    const messages = data.zpData?.messages ?? data.zpData?.historyMsgList;
    if (!Array.isArray(messages)) {
        throw new CommandExecutionError('Boss geek history response did not include a message list');
    }
    if (messages.length === 0) {
        throw new EmptyResultError('boss chatmsg', 'Boss returned no messages for this chat.');
    }
    return messages;
}
async function bossFetch(url,opts={}){
  guard();const u=new URL(url);if(u.origin!==location.origin||u.hostname!=='www.zhipin.com')throw new CommandExecutionError('BOSS request origin mismatch');
  const execute = input => new Promise(resolve=>{const x=new XMLHttpRequest();x.open(input.method,input.url,true);x.withCredentials=true;x.timeout=15000;x.setRequestHeader('Accept','application/json');if(input.method==='POST')x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');x.onload=()=>resolve({status:x.status,body:x.responseText});x.onerror=()=>resolve({error:'NETWORK_ERROR'});x.ontimeout=()=>resolve({error:'REQUEST_TIMEOUT'});x.send(input.body||null)});
  const input={url,method:opts.method||'GET',body:opts.body||null};
  const result=(await window.__webmcpWecliRuntime.requestPrivileged('main_world_eval',{expression:'('+execute.toString()+')('+JSON.stringify(input)+')'})).value;
  if(result?.error)throw new CliError(result.error,'BOSS request failed: '+result.error);
  if(result?.status===401)throw new AuthRequiredError('BOSS','Login required');
  if(!result||result.status<200||result.status>=300)throw new CliError('HTTP_ERROR','BOSS HTTP '+result?.status);
  let data;try{data=JSON.parse(result.body)}catch{throw new CommandExecutionError('BOSS returned non-JSON')}
  if(!data||typeof data!=='object')throw new CommandExecutionError('Malformed BOSS response');if(!opts.allowNonZero&&data.code!==0)assertOk(data);return data;
}function verbose(){} function selectorError(a,b){return new CommandExecutionError(a+': '+b)}
window.__boss={CliError,ArgumentError,CommandExecutionError,AuthRequiredError,EmptyResultError,integer,navigate,same,guard,bossFetch,verbose,selectorError,readPositiveInteger,readRequiredString,checkAuth,checkEnvironment,checkRecruiterSide,assertOk,fetchFriendList,fetchRecommendList,findFriendByUid,clickCandidateInList,typeAndSendMessage,readEncryptSystemId,fetchGeekFriendLabelList,fetchGeekFriendInfoList,findGeekFriendByUid,fetchGeekHistoryMsg,IDENTITY_MISMATCH_CODE};})();
