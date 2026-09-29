/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;
const MAX_USER_VIDEOS_LIMIT = 20;
const USER_VIDEO_COMMENT_CONCURRENCY = 4;
const DEFAULT_COMMENT_LIMIT = 10;
const SEC_UID_PATTERN = /^MS4wLjABAAAA[A-Za-z0-9_-]{8,}$/;
const SEC_UID_HINT = 'sec_uid looks like MS4wLjABAAAA… — it is the last path segment of https://www.douyin.com/user/<sec_uid>, not a nickname or a numeric UID.';
function normalizeSecUid(input) {
    const raw = String(input ?? '').trim();
    if (!raw)
        throw new ArgumentError('douyin user-videos requires a sec_uid', SEC_UID_HINT);
    const fromUrl = raw.match(/douyin\.com\/user\/([A-Za-z0-9_-]+)/);
    const candidate = fromUrl ? fromUrl[1] : raw;
    if (!SEC_UID_PATTERN.test(candidate))
        throw new ArgumentError(`"${raw}" is not a Douyin sec_uid`, SEC_UID_HINT);
    return candidate;
}
function normalizeUserVideosLimit(limit) {
    const numeric = Number(limit);
    if (!Number.isFinite(numeric))
        return MAX_USER_VIDEOS_LIMIT;
    return Math.min(MAX_USER_VIDEOS_LIMIT, Math.max(1, Math.round(numeric)));
}
function normalizeCommentLimit(limit) {
    const numeric = Number(limit);
    if (!Number.isFinite(numeric))
        return DEFAULT_COMMENT_LIMIT;
    return Math.min(DEFAULT_COMMENT_LIMIT, Math.max(1, Math.round(numeric)));
}
async function mapInBatches(items, concurrency, mapper) {
    const results = [];
    for (let index = 0; index < items.length; index += concurrency) {
        const chunk = items.slice(index, index + concurrency);
        results.push(...(await Promise.all(chunk.map(mapper))));
    }
    return results;
}
async function fetchTopComments(awemeId, count) {
    try {
        return await fetchDouyinComments(awemeId, count);
    }
    catch (error) {
        if (error instanceof CliError) {
            throw error;
        }
        throw new CommandExecutionError(`Failed to fetch Douyin comments for video ${awemeId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
__webcliRegisterCommand("user-videos",async (kwargs={}) => {
kwargs={...{"limit":20,"with_comments":true,"comment_limit":10},...kwargs};if(typeof kwargs["sec_uid"]!=='string'||!kwargs["sec_uid"].trim())throw new ArgumentError("sec_uid is required");kwargs["limit"]=integer(kwargs["limit"],20,20);kwargs["with_comments"]=bool(kwargs["with_comments"],true);kwargs["comment_limit"]=integer(kwargs["comment_limit"],10,10);

        const secUid = normalizeSecUid(kwargs.sec_uid);
        const limit = normalizeUserVideosLimit(kwargs.limit);
        const withComments = kwargs.with_comments !== false;
        const commentLimit = normalizeCommentLimit(kwargs.comment_limit);
        const target=`https://www.douyin.com/user/${secUid}`;if(!same(target))return navigate(target);

        const awemeList = (await fetchDouyinUserVideos(secUid, limit)).slice(0, limit);
        if (awemeList.length === 0) {
            throw new EmptyResultError('douyin user-videos', `No videos were returned for sec_uid ${secUid}. Confirm the user exists and the Douyin session is valid.`);
        }
        const videos = withComments
            ? await mapInBatches(awemeList, USER_VIDEO_COMMENT_CONCURRENCY, async (video) => ({
                ...video,
                top_comments: await fetchTopComments(video.aweme_id, commentLimit),
            }))
            : awemeList.map((video) => ({ ...video, top_comments: [] }));
        return videos.map((video, index) => {
            const playUrl = video.video?.play_addr?.url_list?.[0] ?? '';
            return {
                index: index + 1,
                aweme_id: video.aweme_id,
                title: video.desc ?? '',
                duration: Math.round((video.video?.duration ?? null) / 1000),
                digg_count: video.statistics?.digg_count ?? null,
                play_url: playUrl,
                top_comments: video.top_comments ?? [],
            };
        });
    });})();
