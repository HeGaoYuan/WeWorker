/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){class CliError extends Error {constructor(code,message){super(message);this.code=code}}
class ArgumentError extends CliError{constructor(m){super('INVALID_ARGS',m)}}
class CommandExecutionError extends CliError{constructor(m){super('PARSE_ERROR',m)}}
class AuthRequiredError extends CliError{constructor(s,m){super('AUTH_REQUIRED',m||s)}}
class EmptyResultError extends CliError{constructor(m,h){super('EMPTY_RESULT',h||m)}}
function navigate(url){return {__webcli_navigation:{version:1,url,resume:true}}}function same(url){const a=new URL(location.href),b=new URL(url);if(/^\d+$/.test(a.searchParams.get('_time')||''))a.searchParams.delete('_time');if(/^\d+$/.test(b.searchParams.get('_time')||''))b.searchParams.delete('_time');return a.origin===b.origin&&a.pathname===b.pathname&&[...a.searchParams].length===[...b.searchParams].length&&[...b.searchParams].every(([k,v])=>a.searchParams.getAll(k).join('\0')===b.searchParams.getAll(k).join('\0'))}function integer(x,d,max){const r=x===undefined?d:x;const n=typeof r==='string'&&/^\d+$/.test(r)?Number(r):r;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('Integer outside range 1..'+max);return n}function guard(){const t=document.body?.innerText||'';if(/验证码|安全验证|滑动验证|访问验证/.test(t))throw new CliError('CAPTCHA_REQUIRED','Complete site verification in the connected browser');if(/请先登录|登录后查看/.test(t))throw new AuthRequiredError('Login required');}
const ALLOWED_HOSTS=new Set(['share.note.youdao.com','note.youdao.com','share.note.youdao.cn','note.youdao.cn']);
function unwrapEvaluateResult(payload) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && 'session' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}
function normalizeShareUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    throw new ArgumentError('youdao note url cannot be empty', 'Pass a full public share URL from Youdao Notes.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ArgumentError('Invalid Youdao Note URL', 'Example: https://share.note.youdao.com/ynoteshare/index.html?id=...&type=note');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ArgumentError('Youdao Note URL must use http or https');
  }
  if (parsed.username || parsed.password || parsed.port || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new ArgumentError('Youdao Note URL must be under note.youdao.com or note.youdao.cn');
  }
  const shortLink = parsed.protocol === 'https:' && parsed.hostname.startsWith('share.') && /^\/s\/[A-Za-z0-9]+\/?$/.test(parsed.pathname);
  if (!shortLink && !parsed.searchParams.get('id')) {
    throw new ArgumentError('Youdao Note URL must include an id query parameter');
  }
  const type = parsed.searchParams.get('type');
  if (type && type !== 'note') {
    throw new ArgumentError('youdao note only accepts shared note URLs', 'Shared notebooks are not implemented yet.');
  }
  return parsed.toString();
}
function renderShareUrl(url) {
  const parsed = new URL(url);
  // Verified official /share/ dispatcher and shareConfig.json on 2026-09-28.
  // Preserve note identity and type; only the PC note route is supported.
  if (parsed.pathname === '/share/' && parsed.hostname.startsWith('share.')) parsed.pathname = '/ynoteshare/index.html';
  return parsed.toString();
}
async function resolveShareUrl(raw) {
  let url = normalizeShareUrl(raw);
  const first = new URL(url);
  if (!/^\/s\//.test(first.pathname) && first.pathname !== '/noteshare') return renderShareUrl(url);
  let noteId = first.searchParams.get('id');
  for (let hop = 0; hop < 5; hop++) {
    const response = await window.__webmcpWecliRuntime.requestPrivileged('backend_fetch', {
      url, browserFallback: false, redactBodyInTrace: true,
      options: { method: 'GET', redirect: 'manual', timeoutMs: 15000 },
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const next = new URL(response.headers?.location || response.headers?.Location || '', url);
      if (next.protocol !== 'https:' || next.username || next.password || next.port || !ALLOWED_HOSTS.has(next.hostname)) {
        throw new CliError('HOST_NOT_ALLOWED', 'Youdao share redirect left the allowed hosts');
      }
      const nextId = next.searchParams.get('id');
      if (noteId && nextId && noteId !== nextId) throw new CommandExecutionError('Youdao redirect changed note identity');
      if (nextId) noteId = nextId;
      url = next.toString();
      continue;
    }
    if (response.status !== 200) throw new CliError('HTTP_ERROR','Youdao share redirect HTTP '+response.status);
    const finalUrl = normalizeShareUrl(url);
    if (!new URL(finalUrl).searchParams.get('id')) throw new CommandExecutionError('Youdao short link did not resolve a note id');
    return renderShareUrl(finalUrl);
  }
  throw new CommandExecutionError('Youdao share redirect limit exceeded');
}
function formatYoudaoTimestamp(value) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return String(value);
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
function normalizeExtractionResult(payload, sourceUrl) {
  const data = unwrapEvaluateResult(payload);
  if (!Array.isArray(data)) {
    throw new CommandExecutionError('Youdao note extractor returned a malformed payload');
  }
  const ok = data[0] === true;
  if (!ok) {
    const reason = typeof data[1] === 'string' && data[1].trim() ? data[1].trim() : 'unknown_parser_failure';
    if (reason === 'auth') {
      throw new AuthRequiredError('note.youdao.com', 'Youdao shared note requires login or additional permission');
    }
    if (reason === 'not_found') {
      throw new EmptyResultError('youdao note', 'The shared note is missing, expired, cancelled, or inaccessible.');
    }
    throw new CommandExecutionError(`Youdao note parser failed: ${reason}`);
  }
  const title = String(data[1] ?? '');
  const content = String(data[2] ?? '');
  const summary = String(data[3] ?? '');
  const keywords = String(data[4] ?? '');
  const createTime = data[5];
  const fileSize = data[6];
  const hasContentField = data[7] === true;
  const rawContentLength = Number(data[8] ?? 0);
  const finalUrl = String(data[9] || sourceUrl);
  if (!title) {
    throw new CommandExecutionError('Youdao note parser did not extract a title');
  }
  if (!hasContentField) {
    throw new CommandExecutionError('Youdao note parser did not find full note content in the page store');
  }
  if (rawContentLength > 0 && !content) {
    throw new CommandExecutionError('Youdao note parser found note content but extracted no readable text');
  }
  const row = {};
  row.title = title;
  row.content = content;
  row.summary = summary;
  row.keywords = keywords;
  row.created_at = formatYoudaoTimestamp(createTime);
  row.file_size = fileSize == null ? '' : String(fileSize);
  row.url = finalUrl;
  return row;
}
const extract=()=>(
    (function() {

    function walkText(node, out) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i += 1) walkText(node[i], out);
        return;
      }
      if (typeof node[8] === 'string') {
        var text = node[8].replace(/\s+/g, ' ').trim();
        if (text) out.push(text);
      }
      var keys = Object.keys(node);
      for (var j = 0; j < keys.length; j += 1) {
        var value = node[keys[j]];
        if (value && typeof value === 'object') walkText(value, out);
      }
    }

      function cleanText(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      }
      function pageText() {
        return cleanText((document.body && (document.body.innerText || document.body.textContent)) || '').slice(0, 1000);
      }
      function classifyBodyText(text) {
        if (/登录|登陆|请先登录|无权|权限|访问受限|验证码|安全验证|login|forbidden|permission/i.test(text)) return 'auth';
        if (/分享已取消|分享不存在|文件不存在|笔记不存在|页面不存在|已过期|不存在|not found|404/i.test(text)) return 'not_found';
        return '';
      }
      function findStoreState(value, depth, seen) {
        if (!value || typeof value !== 'object' || depth > 10) return null;
        if (seen.indexOf(value) !== -1) return null;
        seen.push(value);
        if (value.storeState && typeof value.storeState === 'object') return value.storeState;
        if (value.content && value.content.data && typeof value.content.data === 'object') return value;
        var keys = Object.keys(value);
        for (var i = 0; i < keys.length; i += 1) {
          var found = findStoreState(value[keys[i]], depth + 1, seen);
          if (found) return found;
        }
        return null;
      }
      function findStoreFromFiber(fiber) {
        var cursor = fiber;
        var stack = [];
        while (cursor || stack.length) {
          if (!cursor) {
            cursor = stack.pop();
            continue;
          }
          var fromState = findStoreState(cursor.memoizedState, 0, []);
          if (fromState) return fromState;
          var fromProps = findStoreState(cursor.memoizedProps, 0, []);
          if (fromProps) return fromProps;
          if (cursor.sibling) stack.push(cursor.sibling);
          cursor = cursor.child;
        }
        return null;
      }
      var root = document.querySelector('#root');
      var body = pageText();
      var bodyKind = classifyBodyText(body);
      if (!root) {
        return [false, bodyKind || 'root_missing', body];
      }
      var reactKey = Object.keys(root).find(function(key) { return key.indexOf('__reactContainer$') === 0; });
      var fiber = (root._reactRootContainer && root._reactRootContainer._internalRoot && root._reactRootContainer._internalRoot.current)
        || (reactKey ? root[reactKey] : null);
      if (!fiber) {
        return [false, bodyKind || 'react_root_missing', body];
      }
      var store = findStoreFromFiber(fiber);
      if (!store) {
        return [false, bodyKind || 'store_missing', body];
      }
      var contentData = store.content && store.content.data;
      if (!contentData || typeof contentData !== 'object') {
        return [false, bodyKind || 'content_data_missing', body];
      }
      var title = cleanText(contentData.tl || document.querySelector('.file-name')?.textContent || document.title || '');
      var hasContentField = Object.prototype.hasOwnProperty.call(contentData, 'content');
      var rawContent = hasContentField ? String(contentData.content || '') : '';
      var content = '';
      if (rawContent) {
        try {
          var parsed = JSON.parse(rawContent);
          var parts = [];
          walkText(parsed, parts);
          content = cleanText(parts.join('\n'));
        } catch (error) {
          content = cleanText(rawContent);
        }
      }
      var summary = '';
      var keywords = [];
      var ai = store.aiSummary;
      if (ai && ai.aiSummary) {
        try {
          var aiPayload = JSON.parse(ai.aiSummary);
          summary = cleanText(aiPayload.description || '');
          if (Array.isArray(aiPayload.keywords)) {
            for (var i = 0; i < aiPayload.keywords.length; i += 1) {
              var keyword = aiPayload.keywords[i];
              if (keyword && keyword.title) keywords.push(cleanText(((keyword.emoji || '') + ' ' + keyword.title).trim()));
            }
          }
        } catch {}
      }
      return [true, title, content, summary, keywords.join(' | '), contentData.ct || null, contentData.sz || null, hasContentField, rawContent.length, window.location.href];
    })()
  );
__webcliRegisterCommand('note',async(args={})=>{const url=await resolveShareUrl(args.url);if(!same(url))return navigate(url);const deadline=Date.now()+10000;let payload;do{payload=(await window.__webmcpWecliRuntime.requestPrivileged('main_world_eval',{expression:'('+extract.toString()+')()'})).value;if(payload[0]||['auth','not_found'].includes(payload[1]))break;await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<deadline);return [normalizeExtractionResult(payload,url)]});})();
