/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;const MAX_SEARCH_LIMIT = 30;
const RENDER_TIMEOUT_MS = 15000;
function parseSearchLimit(raw) {
    const parsed = Number(raw ?? 10);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new ArgumentError(`--limit must be an integer between 1 and ${MAX_SEARCH_LIMIT}, got ${JSON.stringify(raw)}`);
    }
    if (parsed < 1 || parsed > MAX_SEARCH_LIMIT) {
        throw new ArgumentError(`--limit must be between 1 and ${MAX_SEARCH_LIMIT}, got ${parsed}`);
    }
    return parsed;
}
function parseDouyinCount(text) {
    if (typeof text !== 'string') return 0;
    const m = text.replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)([万亿])?$/);
    if (!m) {
        const plain = Number(text.replace(/[,\s]/g, ''));
        return Number.isFinite(plain) ? Math.round(plain) : 0;
    }
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return 0;
    if (m[2] === '万') return Math.round(n * 10_000);
    if (m[2] === '亿') return Math.round(n * 100_000_000);
    return Math.round(n);
}
function extractDouyinVideoId(href) {
    if (typeof href !== 'string' || !href) return '';
    let full = href;
    if (full.startsWith('//')) full = 'https:' + full;
    else if (full.startsWith('/')) full = 'https://www.douyin.com' + full;
    try {
        const parsed = new URL(full);
        if (!/(^|\.)douyin\.com$/.test(parsed.hostname)) return '';
        const match = parsed.pathname.match(/^\/video\/(\d+)$/);
        return match?.[1] ?? '';
    }
    catch {
        return '';
    }
}
function normalizeDouyinVideoUrl(href) {
    const id = extractDouyinVideoId(href);
    return id ? `https://www.douyin.com/video/${id}` : '';
}
function isSearchCardMetadataText(text) {
    if (!text) return true;
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return true;
    if (/^\d+(?:\.\d+)?[万亿]?$/.test(text)) return true;
    if (/^(合集|视频|作者)$/.test(text)) return true;
    if (/^(刚刚|今天|昨天|前天)$/.test(text)) return true;
    if (/^\d+\s*(秒|分钟|小时|天|周|个月|月|年)前$/.test(text)) return true;
    if (/^\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?$/.test(text)) return true;
    return false;
}
function projectCard(card, index) {
    const url = normalizeDouyinVideoUrl(card?.url ?? card?.href);
    const texts = Array.isArray(card?.leafTexts) ? card.leafTexts.map((t) => String(t ?? '').trim()).filter(Boolean) : [];

    const DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
    const COUNT_RE = /^\d+(?:\.\d+)?[万亿]?$/;

    let likes = null;
    let author = '';
    let longest = '';

    for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        if (DURATION_RE.test(t)) continue;
        if (!likes && COUNT_RE.test(t)) {
            likes = parseDouyinCount(t);
            continue;
        }
        if (t === '@' && !author) {
            author = (texts[i + 1] ?? '').trim();
            continue;
        }
        if (t === author) continue;
        if (isSearchCardMetadataText(t)) continue;
        if (t.length > longest.length) longest = t;
    }
    let desc = longest;
    // Strip a leading "@author" that some renders fuse into the desc text node.
    if (author && desc.startsWith('@' + author)) {
        desc = desc.slice(author.length + 1).trim();
    }
    return {
        rank: index + 1,
        desc,
        author,
        url,
        plays: null,
        likes,
        comments: null,
        shares: null,
    };
}
function isProjectedRowUsable(row) {
    return Boolean(row?.url && row?.desc);
}
function projectSearchCards(cards, limit) {
    const window = Array.isArray(cards) ? cards.slice(0, limit) : [];
    const rows = window.map((card, index) => projectCard(card, index));
    const invalidCount = rows.filter((row) => !isProjectedRowUsable(row)).length;
    return { rows: rows.filter(isProjectedRowUsable), invalidCount };
}
const waitAndExtract=()=>(
  new Promise((resolve) => {
    const collectCards = () => {
      const cards = [];
      const lis = document.querySelectorAll('[data-e2e="scroll-list"] li');
      for (const li of lis) {
        const a = li.querySelector('a[href*="/video/"]');
        if (!a) continue;
        const leafTexts = [];
        for (const el of li.querySelectorAll('*')) {
          if (el.children.length > 0) continue;
          const t = (el.textContent || '').trim();
          if (t) leafTexts.push(t);
        }
        cards.push({ href: a.getAttribute('href') || '', leafTexts });
      }
      return cards;
    };
    const detectState = () => {
      const cards = collectCards();
      if (cards.length > 0) return { state: 'rendered', cards };
      // Anonymous gate: Douyin renders a centered "登录后查看更多内容"
      // overlay on /search/ for visitors without sessionid. Match either
      // the literal Chinese prompt or a visible login modal/mask.
      const text = (document.body && document.body.innerText) || '';
      if (/登录后查看|请先登录|登录抖音|验证码|验证|verify_check|安全校验/.test(text)) return { state: 'login_wall' };
      if (/暂无相关搜索结果|没有找到相关结果|搜索结果为空|暂无结果/.test(text)) return { state: 'empty' };
      const modal = document.querySelector('[class*="login-mask"], [class*="LoginMask"], [class*="login-modal"], dialog[role="dialog"]');
      if (modal && modal instanceof HTMLElement) {
        const r = modal.getBoundingClientRect();
        const s = getComputedStyle(modal);
        if (r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden') {
          return { state: 'login_wall' };
        }
      }
      return null;
    };
    const found = detectState();
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const s = detectState();
      if (s) { observer.disconnect(); resolve(s); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      const fallback = detectState();
      resolve(fallback ?? { state: 'timeout' });
    }, 15000);
  })
);
function unwrapEvaluateResult(payload) {
    if (payload && !Array.isArray(payload) && typeof payload === 'object' && 'session' in payload && 'data' in payload) {
        return payload.data;
    }
    return payload;
}
__webcliRegisterCommand("search",async (kwargs={}) => {
        const limit = integer(kwargs.limit,10,30);
        const keyword = String(kwargs.query ?? '').trim();
        if (!keyword) {
            throw new ArgumentError('douyin search 需要 <query> 关键词');
        }
        const target=`https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;if(!same(target))return navigate(target);guard();
        let result;
        try {
            result = unwrapEvaluateResult(await waitAndExtract());
        } catch (error) {
            throw new CommandExecutionError(`Douyin search extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!result || typeof result !== 'object') {
            throw new CommandExecutionError('Douyin search: unexpected evaluator payload shape');
        }
        if (result.state === 'login_wall') {
            throw new AuthRequiredError(
                'www.douyin.com',
                'Douyin search results are blocked behind a login wall — log in at https://www.douyin.com in Chrome first.',
            );
        }
        if (result.state === 'empty') {
            throw new EmptyResultError('douyin search', `No Douyin videos matched "${keyword}".`);
        }
        if (result.state === 'timeout') {
            throw new CommandExecutionError('Douyin search did not render result cards within the timeout. Open the same search in Chrome and verify login/security state before retrying.');
        }
        if (!Array.isArray(result.cards)) {
            throw new CommandExecutionError('Douyin search: evaluator returned malformed cards payload');
        }
        if (result.cards.length === 0) {
            throw new EmptyResultError('douyin search', `No Douyin videos matched "${keyword}".`);
        }
        const projected = projectSearchCards(result.cards, limit);
        if (projected.invalidCount > 0) {
            throw new CommandExecutionError('Douyin search parser found result cards without stable video url or description');
        }
        if (projected.rows.length === 0) {
            throw new EmptyResultError('douyin search', `No Douyin videos matched "${keyword}".`);
        }
        return projected.rows;
    });})();
