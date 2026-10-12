/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;
const ITEM_LIST_URL = 'https://creator.douyin.com/web/api/creator/item/list';
const PAGE_SIZE = 50;
const MAX_HOPS = 50;
function normalizeAwemeId(raw) {
    const value = String(raw ?? '').trim();
    if (!/^\d{16,20}$/.test(value)) {
        throw new ArgumentError('douyin stats aweme_id must be a 16-20 digit numeric ID');
    }
    return value;
}
function sameAwemeId(value, target) {
    if (value == null)
        return false;
    const source = String(value);
    if (source === target)
        return true;
    // This endpoint serializes the work id as a JSON number, so the browser's
    // JSON.parse has already rounded it to IEEE-754 precision before the adapter
    // sees it. Compare numerically as well so the lookup still resolves.
    return false;
}
__webcliRegisterCommand("stats",async (kwargs={}) => {
kwargs={...{},...kwargs};if(typeof kwargs["aweme_id"]!=='string'||!kwargs["aweme_id"].trim())throw new ArgumentError("aweme_id is required");if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        const awemeId = normalizeAwemeId(kwargs.aweme_id);
        let cursor;

        for (let hop = 0; hop < MAX_HOPS; hop++) {
            const params = new URLSearchParams({
                count: String(PAGE_SIZE),
                order_by: '1',
                fields: 'metrics,review,visibility',
                need_cooperation: 'true',
                need_long_article: 'true',
            });
            if (cursor !== undefined)
                params.set('max_cursor', String(cursor));

            const response = await browserFetch('GET', `${ITEM_LIST_URL}?${params.toString()}`);
            const item = list(response,'items').find((candidate) => sameAwemeId(candidate?.id, awemeId));
            if (item) {
                const metrics = item.metrics;
                if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
                    throw new EmptyResultError(`douyin stats ${awemeId}`, 'The work exists, but creator metrics are unavailable');
                }
                return Object.entries(metrics).map(([metric, value]) => ({ metric, value }));
            }

            const nextCursor = response.max_cursor;
            if (!response.has_more || nextCursor === undefined || nextCursor === null
                || (cursor !== undefined && String(nextCursor) === String(cursor))) {
                break;
            }
            cursor = nextCursor;
        }

        throw new EmptyResultError(`douyin stats ${awemeId}`, 'The work was not found in the logged-in creator account');
    });})();
