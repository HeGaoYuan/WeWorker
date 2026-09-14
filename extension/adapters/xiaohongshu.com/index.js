/**
 * Xiaohongshu (小红书) Adapter Script
 *
 * NOTE: Runs in isolated world — can only access DOM, not page JS variables.
 *
 * Verified: xiaohongshu.com, March 2026
 * Maintainer: WeWorker project
 */

// ─── Utilities ───────────────────────────────────────────────────────────────

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── DOM Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse note cards from the search results page.
 *
 * DOM structure:
 * - Container: .feeds-container
 * - Each card: section.note-item[data-index]
 * - Note ID: a.cover[href] → /explore/{id} or /search_result/{id}
 * - Cover image: a.cover img[src]
 * - Title: .footer a.title span
 * - Author name: .card-bottom-wrapper .author .name
 * - Author profile: .card-bottom-wrapper .author[href]
 * - Post date: .card-bottom-wrapper .author .time
 * - Likes: .like-wrapper .count
 */
function parseNoteCards() {
  const notes = [];
  const cards = document.querySelectorAll('section.note-item');

  for (const card of cards) {
    try {
      // 帖子链接和 ID：优先取 a.cover 的 href
      const coverLink = card.querySelector('a.cover');
      const rawHref = coverLink?.getAttribute('href') || '';
      // href 格式：/explore/{id} 或 /search_result/{id}?...
      const idMatch = rawHref.match(/\/(?:explore|search_result)\/([a-f0-9]+)/);
      const noteId = idMatch?.[1] || '';
      const noteUrl = noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '';

      // 封面图
      const imgEl = card.querySelector('a.cover img');
      const image = imgEl?.getAttribute('src') || '';

      // 标题
      const titleEl = card.querySelector('.footer a.title span');
      const title = titleEl?.textContent?.trim() || '';

      // 作者信息
      const authorEl = card.querySelector('.card-bottom-wrapper .author');
      const authorName = authorEl?.querySelector('.name')?.textContent?.trim() || '';
      const authorHref = authorEl?.getAttribute('href') || '';
      const authorUrl = authorHref ? `https://www.xiaohongshu.com${authorHref.startsWith('/') ? authorHref : '/' + authorHref}` : '';

      // 发布时间
      const timeEl = card.querySelector('.card-bottom-wrapper .author .time');
      const postTime = timeEl?.textContent?.trim() || '';

      // 点赞数
      const likesEl = card.querySelector('.like-wrapper .count');
      const likes = likesEl?.textContent?.trim() || '0';

      if (title || noteId) {
        notes.push({ noteId, title, image, authorName, authorUrl, postTime, likes, url: noteUrl });
      }
    } catch (err) {
      console.error('Failed to parse note card:', err);
    }
  }

  return notes;
}

/**
 * Parse note detail from the current explore page.
 *
 * DOM structure:
 * - Title: #detail-title
 * - Body text: #detail-desc .note-text (plain text spans + hashtag links)
 * - Post date: .bottom-container .date
 * - Images (图文): .note-slider .swiper-slide:not(.swiper-slide-duplicate)[data-swiper-slide-index] img[src]
 * - Video (视频): .xgplayer video[src] (blob URL, not useful)
 *   - Cover: xg-poster[style] → background-image url
 *   - Duration: xg-time span:last-child
 * - Total comments: .comments-container .total
 * - Each top-level comment: .parent-comment .comment-item (not .comment-item-sub)
 *   - Comment ID: [id^="comment-"]
 *   - Author name: .author .name
 *   - Content: .content .note-text span (first plain span)
 *   - Date: .info .date span:first-child
 *   - Location: .info .date .location
 *   - Likes: .interactions .like .count
 *   - Reply count: .interactions .reply .count
 */
function parseNoteDetail() {
  const title = document.querySelector('#detail-title')?.textContent?.trim() || '';

  // 正文：拼接所有文本节点和 hashtag 链接文本
  const descEl = document.querySelector('#detail-desc .note-text');
  let body = '';
  if (descEl) {
    body = Array.from(descEl.childNodes)
      .map(node => node.textContent?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  // 检测是否为视频帖子
  const playerEl = document.querySelector('.xgplayer');
  let noteType = 'image';
  let video = null;

  if (playerEl) {
    noteType = 'video';
    // 封面图：从 xg-poster 的 background-image style 中提取 URL
    const posterEl = playerEl.querySelector('xg-poster');
    const posterStyle = posterEl?.getAttribute('style') || '';
    const coverMatch = posterStyle.match(/url\(["']?([^"')]+)["']?\)/);
    const cover = coverMatch?.[1] || '';
    // 时长：xg-time 的最后一个 span（格式 "00:09"）
    const durationEl = playerEl.querySelector('xg-time span:last-child');
    const duration = durationEl?.textContent?.trim() || '';
    video = { cover, duration };
  }

  // 图片列表（视频帖子无图片）：排除 swiper 的 duplicate slide，按 data-swiper-slide-index 排序去重
  const imageMap = new Map();
  const slideEls = document.querySelectorAll('.note-slider .swiper-slide:not(.swiper-slide-duplicate)');
  for (const slide of slideEls) {
    const idx = parseInt(slide.getAttribute('data-swiper-slide-index') ?? '-1', 10);
    if (idx < 0) continue;
    const src = slide.querySelector('img[src]')?.getAttribute('src') || '';
    if (src && !imageMap.has(idx)) {
      imageMap.set(idx, src);
    }
  }
  const images = Array.from(imageMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, src]) => src);

  // 发布时间
  const dateEl = document.querySelector('.bottom-container .date');
  const postDate = dateEl?.textContent?.trim() || '';

  // 评论总数
  const totalEl = document.querySelector('.comments-container .total');
  const totalComments = totalEl?.textContent?.trim() || '';

  // 解析顶层评论（排除子评论）
  const comments = [];
  const commentEls = document.querySelectorAll('.parent-comment .comment-item:not(.comment-item-sub)');
  for (const el of commentEls) {
    const commentId = el.id?.replace('comment-', '') || '';
    const authorName = el.querySelector('.author .name')?.textContent?.trim() || '';
    // 评论正文：取第一个纯文本 span（跳过 emoji img）
    const contentSpans = el.querySelectorAll('.content .note-text span');
    const content = Array.from(contentSpans).map(s => s.textContent?.trim()).filter(Boolean).join('') || '';
    const dateSpans = el.querySelectorAll('.info .date span');
    const commentDate = dateSpans[0]?.textContent?.trim() || '';
    const location = el.querySelector('.info .date .location')?.textContent?.trim() || '';
    const likes = el.querySelector('.interactions .like .count')?.textContent?.trim() || '0';
    const replyCount = el.querySelector('.interactions .reply .count')?.textContent?.trim() || '0';

    if (content || authorName) {
      comments.push({ commentId, authorName, content, date: commentDate, location, likes, replyCount });
    }
  }

  return { title, body, noteType, video, images, postDate, totalComments, comments };
}

// ─── Tool Handler Functions ──────────────────────────────────────────────────

/**
 * Navigate to the Xiaohongshu homepage.
 */
async function navigateToHomepage() {
  try {
    const currentUrl = window.location.href;

    setTimeout(() => {
      window.location.href = 'https://www.xiaohongshu.com/';
    }, 100);

    return {
      status: 'navigating',
      message: 'Navigating to Xiaohongshu homepage. Please wait 3-5 seconds for the page to load.',
      previousUrl: currentUrl,
      targetUrl: 'https://www.xiaohongshu.com/',
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

/**
 * Search for notes (帖子) by keyword, with optional filters.
 *
 * 固定两步流程（每次调用都执行）：
 * 步骤1：若当前不在该关键字的搜索结果页 → 导航过去，返回 navigating（需再次调用）
 * 步骤2：已在正确的搜索结果页 → 应用筛选条件（如有）→ 解析并返回帖子列表
 *
 * 筛选面板 DOM 结构：
 * - 触发按钮：.filter（mouseenter 触发展开）
 * - 面板：.filter-panel > .filter-container > .filters-wrapper > .filters
 * - 每个 .filters 的第一个 span 是分类名称
 * - 选项：.filters .tags span（当前选中的 .tags 有 .active 类）
 *
 * @param {object} args - { keyword, sortBy?, noteType?, publishTime?, searchScope?, location? }
 */
async function searchNotes(args) {
  try {
    const { keyword, sortBy, noteType, publishTime, searchScope, location } = args;

    if (!keyword || !keyword.trim()) {
      return {
        error: 'Missing required parameter',
        message: 'keyword parameter is required',
      };
    }

    if (!window.location.href.includes('xiaohongshu.com')) {
      return {
        error: 'Not on Xiaohongshu',
        message: 'Please navigate to Xiaohongshu first using xiaohongshu.com.navigate_to_homepage',
      };
    }

    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword.trim())}&source=web_search_result_notes`;
    const currentUrl = window.location.href;

    // 步骤1：检查是否已在该关键字的搜索结果页
    // URL 中包含 search_result 且 keyword 参数匹配，才认为是正确的结果页
    const isOnCorrectPage = currentUrl.includes('xiaohongshu.com/search_result')
      && currentUrl.includes(`keyword=${encodeURIComponent(keyword.trim())}`);

    if (!isOnCorrectPage) {
      setTimeout(() => {
        window.location.href = searchUrl;
      }, 100);

      return {
        status: 'navigating',
        message: `正在搜索"${keyword.trim()}"，请等待 3-5 秒页面加载完成后再次调用此工具获取结果。`,
        keyword: keyword.trim(),
        searchUrl,
        previousUrl: currentUrl,
        note: '页面加载完成后，请用相同的 keyword（和筛选参数）再次调用 xiaohongshu.com.search_notes。',
      };
    }

    // 步骤2：已在正确的搜索结果页 → 应用筛选（如有）→ 解析
    const filterMap = {
      '排序依据': sortBy,
      '笔记类型': noteType,
      '发布时间': publishTime,
      '搜索范围': searchScope,
      '位置距离': location,
    };
    const hasFilters = Object.values(filterMap).some(v => v);

    if (hasFilters) {
      const filterBtn = document.querySelector('.filter');
      if (!filterBtn) {
        return { error: 'Filter button not found', message: '页面上找不到筛选按钮' };
      }

      filterBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(600);

      // 如果面板没展开（offsetParent 为 null 表示隐藏），尝试 click
      const filterPanel = document.querySelector('.filter-panel');
      if (!filterPanel || filterPanel.offsetParent === null) {
        filterBtn.click();
        await sleep(600);
      }

      for (const [categoryName, targetValue] of Object.entries(filterMap)) {
        if (!targetValue) continue;

        const filterGroups = document.querySelectorAll('.filter-panel .filters');
        let targetGroup = null;
        for (const group of filterGroups) {
          if (group.querySelector('span')?.textContent?.trim() === categoryName) {
            targetGroup = group;
            break;
          }
        }
        if (!targetGroup) continue;

        for (const tag of targetGroup.querySelectorAll('.tags')) {
          if (tag.querySelector('span')?.textContent?.trim() === targetValue) {
            if (!tag.classList.contains('active')) {
              tag.click();
              await sleep(300);
            }
            break;
          }
        }
      }

      filterBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      await sleep(2500);
    }

    await waitForElement('section.note-item', 8000);
    await sleep(500);

    const notes = parseNoteCards();

    return {
      status: 'success',
      keyword: keyword.trim(),
      currentUrl: window.location.href,
      appliedFilters: { sortBy, noteType, publishTime, searchScope, location },
      totalNotes: notes.length,
      notes,
    };
  } catch (error) {
    return {
      error: 'Failed to search notes',
      message: error.message,
    };
  }
}

/**
 * Open a note by ID or URL, then parse and return its detail.
 *
 * 两阶段策略：
 * 1. 若当前不在目标帖子页 → 导航过去，返回 navigating
 * 2. 若已在帖子页 → 解析并返回帖子详情（标题、正文、评论等）
 *
 * @param {object} args - { id?: string, url?: string }
 */
async function openNote(args) {
  try {
    const { id, url } = args;

    if (!id && !url) {
      return {
        error: 'Missing required parameter',
        message: 'Either id or url is required',
      };
    }

    // 解析目标 URL
    let targetUrl = '';
    let noteId = '';
    if (url) {
      // 从 URL 中提取 ID
      const match = url.match(/\/(?:explore|search_result)\/([a-f0-9]+)/);
      noteId = match?.[1] || '';
      targetUrl = noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : url;
    } else {
      noteId = id.trim();
      targetUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
    }

    // 已在目标帖子页 → 直接解析
    const currentUrl = window.location.href;
    if (currentUrl.includes(`/explore/${noteId}`)) {
      await waitForElement('#detail-title', 8000);
      await sleep(500);

      const detail = parseNoteDetail();

      return {
        status: 'success',
        noteId,
        noteUrl: targetUrl,
        ...detail,
      };
    }

    // 不在目标页 → 导航过去
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 100);

    return {
      status: 'navigating',
      message: `Opening note ${noteId}. Please wait 3-5 seconds for the page to load, then call this tool again to get the note detail.`,
      noteId,
      noteUrl: targetUrl,
      previousUrl: currentUrl,
      note: 'Wait for the note page to load, then call xiaohongshu.com.open_note again with the same id/url to parse the content.',
    };
  } catch (error) {
    return {
      error: 'Failed to open note',
      message: error.message,
    };
  }
}

// ─── Adapter Registration ────────────────────────────────────────────────────

window.__webmcpRegister({
  name: 'xiaohongshu-adapter',
  match: ['xiaohongshu.com'],
  tools: [
    {
      name: 'xiaohongshu.com.navigate_to_homepage',
      description: 'Navigate to the Xiaohongshu (小红书) homepage.',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: () => navigateToHomepage(),
    },

    {
      name: 'xiaohongshu.com.search_notes',
      description:
        'Search for notes (帖子) on Xiaohongshu by keyword with optional filters. If not on the search results page, navigates there first — call again after 3-5 seconds (with the same keyword and desired filters) to apply filters and get results.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '搜索关键字 (e.g., "咖啡", "旅行攻略", "穿搭")',
          },
          sortBy: {
            type: 'string',
            description: '排序依据',
            enum: ['综合', '最新', '最多点赞', '最多评论', '最多收藏'],
          },
          noteType: {
            type: 'string',
            description: '笔记类型',
            enum: ['不限', '视频', '图文'],
          },
          publishTime: {
            type: 'string',
            description: '发布时间',
            enum: ['不限', '一天内', '一周内', '半年内'],
          },
          searchScope: {
            type: 'string',
            description: '搜索范围',
            enum: ['不限', '已看过', '未看过', '已关注'],
          },
          location: {
            type: 'string',
            description: '位置距离',
            enum: ['不限', '同城', '附近'],
          },
        },
        required: ['keyword'],
      },
      handler: (args) => searchNotes(args),
    },
    {
      name: 'xiaohongshu.com.open_note',
      description:
        'Open a Xiaohongshu note by ID or URL and return its full detail: title, body text, post date, and top-level comments (author, content, date, location, likes). For image notes, returns noteType="image" and images[]. For video notes, returns noteType="video" and video={cover, duration} — LIMITATION: the actual video URL is not available; the adapter runs in an isolated DOM context and cannot access the real video URL stored in the page JS memory (xgplayer config). If not already on the note page, navigates there first — call again after 3-5 seconds to get the content.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Note ID (e.g., "69a7ff7e00000000220334e1")',
          },
          url: {
            type: 'string',
            description: 'Full note URL (e.g., "https://www.xiaohongshu.com/explore/69a7ff7e00000000220334e1")',
          },
        },
      },
      handler: (args) => openNote(args),
    },
  ],
});
