/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){class CliError extends Error {constructor(code,message){super(message);this.code=code}}
class ArgumentError extends CliError{constructor(m){super('INVALID_ARGS',m)}}
class CommandExecutionError extends CliError{constructor(m){super('PARSE_ERROR',m)}}
class AuthRequiredError extends CliError{constructor(s,m){super('AUTH_REQUIRED',m||s)}}
class EmptyResultError extends CliError{constructor(m,h){super('EMPTY_RESULT',h||m)}}
function navigate(url){return {__webcli_navigation:{version:1,url,resume:true}}}function same(url){const a=new URL(location.href),b=new URL(url);return a.origin===b.origin&&a.pathname===b.pathname&&[...a.searchParams].length===[...b.searchParams].length&&[...b.searchParams].every(([k,v])=>a.searchParams.getAll(k).join('\0')===b.searchParams.getAll(k).join('\0'))}function integer(x,d,max){const r=x===undefined?d:x;const n=typeof r==='string'&&/^\d+$/.test(r)?Number(r):r;if(!Number.isSafeInteger(n)||n<1||n>max)throw new ArgumentError('Integer outside range 1..'+max);return n}function guard(){const t=document.body?.innerText||'';if(/验证码|安全验证|滑动验证|访问验证/.test(t))throw new CliError('CAPTCHA_REQUIRED','Complete site verification in the connected browser');if(/请先登录|登录后查看/.test(t))throw new AuthRequiredError('Login required');}
const CITY_ID = {
    beijing: 2, '北京': 2,
    shanghai: 1, '上海': 1,
    guangzhou: 4, '广州': 4,
    shenzhen: 7, '深圳': 7,
    hangzhou: 3, '杭州': 3,
    chengdu: 8, '成都': 8,
    chongqing: 9, '重庆': 9,
    nanjing: 5, '南京': 5,
    suzhou: 6, '苏州': 6,
    xian: 17, '西安': 17,
    wuhan: 16, '武汉': 16,
    tianjin: 10, '天津': 10,
    qingdao: 21, '青岛': 21,
    changsha: 344, '长沙': 344,
    dalian: 19, '大连': 19,
    shenyang: 18, '沈阳': 18,
    kunming: 267, '昆明': 267,
    fuzhou: 14, '福州': 14,
    xiamen: 15, '厦门': 15,
    hefei: 110, '合肥': 110,
};
const SEARCH_COLUMNS = ['rank', 'shop_id', 'name', 'rating', 'reviews', 'price', 'cuisine', 'district', 'url'];
const SHOP_COLUMNS = ['field', 'value'];
function resolveCityId(cityArg) {
    if (cityArg == null || cityArg === '') return null;
    const raw = String(cityArg).trim().toLowerCase();
    if (/^\d+$/.test(raw)) return Number(raw);
    const id = CITY_ID[raw];
    if (!id) {
        const names = Object.keys(CITY_ID).filter((k) => /^[a-z]+$/.test(k)).join(', ');
        throw new ArgumentError(
            'city',
            `unknown city '${cityArg}'. pass a numeric cityId or one of: ${names}`,
        );
    }
    return id;
}
function requireSearchLimit(value) {
    const raw = value == null || value === '' ? 15 : value;
    const limit = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(limit) || limit < 1 || limit > 15) {
        throw new ArgumentError('limit must be an integer between 1 and 15 (dianping single page)');
    }
    return limit;
}
function normalizeShopId(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) throw new ArgumentError('shop_id must be a non-empty string');

    const idMatch = raw.match(/\/shop\/([^?#/]+)/);
    const shopId = idMatch ? idMatch[1] : raw;
    if (!/^[A-Za-z0-9_-]+$/.test(shopId)) {
        throw new ArgumentError(`'${raw}' does not look like a dianping shop id`);
    }
    return shopId;
}
function wrapDianpingStep(label, fn) {
    return Promise.resolve()
        .then(fn)
        .catch((err) => {
            if (err?.code) throw err;
            const message = err?.message || String(err);
            throw new CommandExecutionError(`dianping ${label} failed: ${message}`);
        });
}
function detectAuthOrPageFailure({ text = '', url = '' }, contextHint, { emptyPatterns = [] } = {}) {
    const signal = `${url} ${text}`;
    if (/verify\.meituan\.com|verifyimg|身份核实|请依次点击|美团安全验证|Yoda/i.test(signal)) {
        throw new AuthRequiredError(
            'dianping.com',
            `dianping ${contextHint} blocked by captcha — open ${url || 'www.dianping.com'} manually in this profile and solve the captcha, then retry`,
        );
    }
    if (/login\.dianping\.com|account\.dianping\.com|请先登录|未登录|请登录/.test(signal)) {
        throw new AuthRequiredError(
            'dianping.com',
            `dianping ${contextHint} requires login — sign in to dianping.com in this profile, then retry`,
        );
    }
    if (emptyPatterns.some((pattern) => pattern.test(signal))) {
        throw new EmptyResultError(`dianping ${contextHint}`);
    }
    const sample = '';
    throw new CommandExecutionError(
        `dianping ${contextHint} did not render expected data${sample}`,
        'This usually means dianping changed its HTML, returned an unexpected error page, or the browser profile hit an unrecognized anti-bot state.',
    );
}
function parseReviewCount(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const wanMatch = s.match(/^([\d.]+)\s*万/);
    if (wanMatch) {
        const n = Number(wanMatch[1]);
        return Number.isFinite(n) ? Math.round(n * 10000) : null;
    }
    const plainMatch = s.match(/(\d+(?:\.\d+)?)/);
    if (!plainMatch) return null;
    const n = Number(plainMatch[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
}
function parsePrice(raw) {
    if (!raw) return null;
    const m = String(raw).match(/[¥￥]\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}
async function cityDocument(url){const r=await fetch(url,{credentials:'include',redirect:'error'});if(!r.ok)throw new CliError('HTTP_ERROR','City lookup HTTP '+r.status);const text=await r.text();if(/verify\.meituan|请先登录|验证码/.test(text))throw new AuthRequiredError('dianping','City lookup requires manual login/verification');return new DOMParser().parseFromString(text,'text/html');}
async function resolveCity(city){if(city===undefined||city==='')return null;const raw=String(city).trim();if(/^\d+$/.test(raw))return integer(raw,1,999999);const known=CITY_ID[raw.toLowerCase()];if(known)return known;let slug=raw.toLowerCase();if(/^[一-龥]+$/.test(raw)){const document=await cityDocument('https://www.dianping.com/citylist');const map=(function(document){function buildCitylistMap() {
    const map = {};
    const anchors = document.querySelectorAll('a');
    anchors.forEach((a) => {
        const hrefRaw = a.getAttribute('href') || '';
        const text = ((a.textContent || '').trim());
        if (!text || !/^[一-龥]+$/.test(text)) return;
        const href = hrefRaw.replace(/^https?:/, '');
        const m = href.match(/^\/\/(?:www\.)?dianping\.com\/([a-z]+)\/?$/)
            || href.match(/^\/([a-z]+)\/?$/);
        if (!m) return;
        const slug = m[1].toLowerCase();
        // Filter out non-city slugs that share the shape (e.g. /citylist itself,
        // /promo, /events). Only register the first slug per Chinese label.
        if (slug === 'citylist' || slug === 'promo' || slug === 'events') return;
        if (!map[text]) map[text] = slug;
    });
    return map;
}
function extractCityIdFromPage() {
    const baseHref = (typeof location !== 'undefined' && location.href) || 'https://www.dianping.com/';
    const anchors = document.querySelectorAll('a[href]');
    for (const a of anchors) {
        const hrefRaw = a.getAttribute('href') || '';
        let url;
        try {
            url = new URL(hrefRaw, baseHref);
        } catch {
            continue;
        }
        if (url.protocol !== 'https:') continue;
        if (url.hostname !== 'www.dianping.com' && url.hostname !== 'dianping.com') continue;
        const m = url.pathname.match(/^\/search\/keyword\/(\d+)(?:\/|$)/);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isInteger(n) && n > 0) return n;
    }
    return null;
};return buildCitylistMap()})(document);slug=map[raw];}if(!slug||!/^[a-z]+$/.test(slug))throw new ArgumentError('Unknown city; use the official city name or cityId');const document=await cityDocument('https://www.dianping.com/'+slug);const id=(function(document){function buildCitylistMap() {
    const map = {};
    const anchors = document.querySelectorAll('a');
    anchors.forEach((a) => {
        const hrefRaw = a.getAttribute('href') || '';
        const text = ((a.textContent || '').trim());
        if (!text || !/^[一-龥]+$/.test(text)) return;
        const href = hrefRaw.replace(/^https?:/, '');
        const m = href.match(/^\/\/(?:www\.)?dianping\.com\/([a-z]+)\/?$/)
            || href.match(/^\/([a-z]+)\/?$/);
        if (!m) return;
        const slug = m[1].toLowerCase();
        // Filter out non-city slugs that share the shape (e.g. /citylist itself,
        // /promo, /events). Only register the first slug per Chinese label.
        if (slug === 'citylist' || slug === 'promo' || slug === 'events') return;
        if (!map[text]) map[text] = slug;
    });
    return map;
}
function extractCityIdFromPage() {
    const baseHref = (typeof location !== 'undefined' && location.href) || 'https://www.dianping.com/';
    const anchors = document.querySelectorAll('a[href]');
    for (const a of anchors) {
        const hrefRaw = a.getAttribute('href') || '';
        let url;
        try {
            url = new URL(hrefRaw, baseHref);
        } catch {
            continue;
        }
        if (url.protocol !== 'https:') continue;
        if (url.hostname !== 'www.dianping.com' && url.hostname !== 'dianping.com') continue;
        const m = url.pathname.match(/^\/search\/keyword\/(\d+)(?:\/|$)/);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isInteger(n) && n > 0) return n;
    }
    return null;
};return extractCityIdFromPage()})(document);if(!id)throw new CommandExecutionError('City page has no search cityId');return id;}

function extractSearchRows() {
    const items = document.querySelectorAll('#shop-all-list li');
    if (items.length === 0) {
        const body = document.body;
        const sampleText = (body && (body.innerText || body.textContent)) || '';
        return {
            ok: false,
            sample: sampleText.slice(0, 800),
            url: location.href,
        };
    }
    const rows = [];
    items.forEach((el, i) => {
        const resultShape = el.querySelector('.tit h4, .review-num, .mean-price, .tag-addr')
            || el.querySelector('.tit a, a[data-shopid], a[href*="/shop/"]');
        if (!resultShape) return;

        const link = el.querySelector('.tit a[href*="/shop/"]')
            || el.querySelector('a[data-shopid]')
            || el.querySelector('a[href*="/shop/"]');
        const shopId = (link && link.getAttribute('data-shopid'))
            || (link && (link.getAttribute('href') || '').match(/\/shop\/([^?#/]+)/)?.[1])
            || '';
        const titleEl = el.querySelector('.tit h4');
        const name = (titleEl && titleEl.textContent && titleEl.textContent.trim())
            || (link && link.getAttribute('title'))
            || '';
        const reviewEl = el.querySelector('.review-num b');
        const reviewsRaw = (reviewEl && reviewEl.textContent && reviewEl.textContent.trim()) || '';
        const priceEl = el.querySelector('.mean-price b');
        const priceRaw = (priceEl && priceEl.textContent && priceEl.textContent.trim()) || '';
        const tagAddr = Array.from(el.querySelectorAll('.tag-addr .tag'))
            .map((t) => t.textContent.trim())
            .filter(Boolean);
        let starClass = '';
        const starWrap = el.querySelector('.nebula_star');
        if (starWrap) {
            const m = starWrap.outerHTML.match(/star_(\d{2})/g);
            if (m && m.length) {
                const last = m[m.length - 1];
                const lastDigits = last.match(/star_(\d{2})/)[1];
                starClass = lastDigits;
            }
        }
        rows.push({
            rank: i + 1,
            shop_id: shopId,
            name,
            starClass,
            reviewsRaw,
            priceRaw,
            cuisine: tagAddr[0] || '',
            district: tagAddr[1] || '',
            url: shopId ? 'https://www.dianping.com/shop/' + shopId : '',
        });
    });
    return { ok: true, rows };
}
function extractShopFields() {
    const head = document.querySelector('.shop-head');
    if (!head) {
        const body = document.body;
        const sampleText = (body && (body.innerText || body.textContent)) || '';
        return {
            ok: false,
            sample: sampleText.slice(0, 800),
            url: location.href,
        };
    }
    const headText = head.textContent.trim().replace(/\s+/g, ' ');
    // Shop name: dianping puts it as "【芈重山老火锅(五道口店)】" at
    // the head of document.title (full-width 【】, not ASCII []).
    // Try selectors first, then fall back to title parsing.
    const titleEl = document.querySelector('.shop-name, .shop-head h2, .shop-head h1');
    let name = (titleEl && titleEl.textContent && titleEl.textContent.trim()) || '';
    if (!name) {
        const t = document.title || '';
        const m = t.match(/【([^】]+)】/);
        if (m) name = m[1].trim();
    }
    const ratingEl = document.querySelector('.star-score');
    const ratingText = (ratingEl && ratingEl.textContent && ratingEl.textContent.trim()) || '';
    const features = Array.from(document.querySelectorAll('.shop-feature'))
        .map((f) => f.textContent.trim())
        .filter(Boolean);
    const addressEl = document.querySelector('.desc-info');
    const address = (addressEl && addressEl.textContent && addressEl.textContent.trim()) || '';
    const subwayMatch = headText.match(/距(?:地铁)?[^\s]+?步行\d+m/);
    const subway = subwayMatch ? subwayMatch[0] : '';

    // Reviews: prefer .reviews / .review-num selector — its text is
    // "21241条" cleanly. Whitespace-collapsed headText fuses the
    // rating "4.8" with review digits ("4.821241条"), so a
    // head-wide /\d+条/ regex captures "4.821241" and rounds to 5.
    const reviewEl = document.querySelector('.reviews, .review-num, .reviewCount, .reviewCountSentence');
    let reviewsRaw = (reviewEl && reviewEl.textContent && reviewEl.textContent.trim()) || '';
    if (!reviewsRaw) {
        const titleReviewEl = document.querySelector('.review-title');
        const titleText = titleReviewEl && titleReviewEl.textContent;
        const titleM = titleText && titleText.match(/评价\(([\d.,万]+)\)/);
        if (titleM) reviewsRaw = titleM[1];
    }

    // Shop-head text holds price + cuisine + district + rank.
    const priceMatch = headText.match(/[¥￥]\s*\d+(?:\.\d+)?/);

    // Try to read score breakdown ("口味:4.8 环境:4.8 服务:4.8 食材:4.9").
    const breakdown = {};
    const breakKeys = ['口味', '环境', '服务', '食材'];
    for (const key of breakKeys) {
        const m = headText.match(new RegExp(key + '[:：]\\s*([0-9.]+)'));
        if (m) breakdown[key] = Number(m[1]);
    }

    // Hours: "营业中 11:00-次日02:00" / "今日休息".
    const hoursMatch = headText.match(/营业中[^\s]*\d{1,2}:\d{2}-(?:次日)?\d{1,2}:\d{2}|今日休息|暂停营业/);

    // Rank line: "海淀区 重庆火锅 口味榜 · 第1名".
    const rankMatch = headText.match(/[^\s]+?(?:口味|人气|环境|服务)榜\s*[·•]\s*第\d+名/);

    return {
        ok: true,
        name,
        rating: ratingText,
        reviewsRaw,
        priceRaw: (priceMatch && priceMatch[0]) || '',
        breakdown,
        features,
        address,
        subway,
        hours: (hoursMatch && hoursMatch[0]) || '',
        rank: (rankMatch && rankMatch[0]) || '',
        url: location.href,
    };
}
window.__dianping={CliError,ArgumentError,AuthRequiredError,CommandExecutionError,EmptyResultError,resolveCity,normalizeShopId,wrapDianpingStep,detectAuthOrPageFailure,parseReviewCount,parsePrice,navigate,same,integer,guard,extractSearchRows,extractShopFields};})();
