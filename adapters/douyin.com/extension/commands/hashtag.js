/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireListField(res, field, action) {
    if (!isPlainObject(res)) {
        throw new CommandExecutionError(`douyin hashtag ${action}: API returned malformed payload`);
    }
    const list = res[field];
    if (list === undefined || list === null) throw new CommandExecutionError('Douyin response missing '+field);
    if (!Array.isArray(list)) {
        throw new CommandExecutionError(`douyin hashtag ${action}: API returned malformed "${field}"`);
    }
    return list;
}
function validateHashtagArgs(kwargs) {
    const action = kwargs.action;
    const limit = Number(kwargs.limit ?? 10);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new ArgumentError(`--limit must be a positive integer, got ${JSON.stringify(kwargs.limit)}`);
    }
    if (action === 'search') {
        const keyword = String(kwargs.keyword ?? '').trim();
        if (!keyword) {
            throw new ArgumentError('douyin hashtag search 需要 --keyword <关键词>', '示例: opencli douyin hashtag search --keyword 美食');
        }
        return;
    }
    if (action === 'suggest') {
        const cover = String(kwargs.cover ?? '').trim();
        if (!cover) {
            throw new ArgumentError('douyin hashtag suggest 需要 --cover <cover_uri>', 'suggest 基于已上传的视频封面做 AI 推荐, 不是关键词搜索. 关键词搜索请用 `douyin hashtag search --keyword <词>`.');
        }
    }
}
__webcliRegisterCommand("hashtag",async (kwargs={}) => {
kwargs={...{"keyword":"","cover":"","limit":10},...kwargs};if(typeof kwargs["action"]!=='string'||!kwargs["action"].trim())throw new ArgumentError("action is required");kwargs["limit"]=integer(kwargs["limit"],10,1000);if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        validateHashtagArgs(kwargs);
        const action = kwargs.action;
        if (action === 'search') {
            const keyword = String(kwargs.keyword ?? '').trim();
            // challenge/search answers 200 with an empty body; the creator
            // studio composer reads suggestions from this endpoint instead,
            // which ignores count and returns a fixed-size list (#2205).
            const url = `https://creator.douyin.com/aweme/v1/search/challengesug/?keyword=${encodeURIComponent(keyword)}&source=challenge_create&aid=2906`;
            const res = await browserFetch('GET', url);
            const list = requireListField(res, 'sug_list', 'search');
            const rows = list.flatMap(c => {
                if (!isPlainObject(c) || typeof c.cha_name !== 'string' || !c.cha_name) return [];
                return [{
                    name: c.cha_name,
                    id: c.cid ?? '',
                    view_count: c.view_count ?? null,
                }];
            });
            if (list.length > 0 && rows.length === 0) {
                throw new CommandExecutionError('douyin hashtag search: API returned suggestions but none had a stable shape');
            }
            return rows.slice(0, kwargs.limit);
        }
        if (action === 'suggest') {
            const cover = String(kwargs.cover ?? '').trim();
            const url = `https://creator.douyin.com/web/api/media/hashtag/rec/?cover_uri=${encodeURIComponent(cover)}&aid=1128`;
            const res = await browserFetch('GET', url);
            const list = requireListField(res, 'hashtag_list', 'suggest');
            return list.map(h => ({ name: h?.name ?? '', id: h?.id ?? '', view_count: h?.view_count ?? null }));
        }
        if (action === 'hot') {
            const kw = String(kwargs.keyword ?? '').trim();
            const url = `https://creator.douyin.com/aweme/v1/hotspot/recommend/?${kw ? `keyword=${encodeURIComponent(kw)}&` : ''}aid=1128`;
            const res = await browserFetch('GET', url);
            if (!isPlainObject(res)) {
                throw new CommandExecutionError('douyin hashtag hot: API returned malformed payload');
            }
            const hotspotList = res.hotspot_list;
            const allSentences = res.all_sentences;
            if (hotspotList !== undefined && hotspotList !== null && !Array.isArray(hotspotList)) {
                throw new CommandExecutionError('douyin hashtag hot: API returned malformed "hotspot_list"');
            }
            if (allSentences !== undefined && allSentences !== null && !Array.isArray(allSentences)) {
                throw new CommandExecutionError('douyin hashtag hot: API returned malformed "all_sentences"');
            }
            if (!Array.isArray(hotspotList) && !Array.isArray(allSentences)) throw new CommandExecutionError('Douyin hotspot lists missing');
            const items = Array.isArray(hotspotList)
                ? hotspotList
                : Array.isArray(allSentences)
                    ? allSentences.map(h => ({
                        sentence: h?.word ?? '',
                        hot_value: h?.hot_value,
                        sentence_id: h?.sentence_id ?? '',
                    }))
                    : [];
            return items.slice(0, kwargs.limit).map(h => ({
                name: h?.sentence ?? '',
                id: h && 'sentence_id' in h ? h.sentence_id : '',
                view_count: h?.hot_value ?? null,
            }));
        }
        throw new ArgumentError(`未知的 action: ${action}`);
    });})();
