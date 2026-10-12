/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;

__webcliRegisterCommand("drafts",async (kwargs={}) => {
kwargs={...{"limit":20},...kwargs};kwargs["limit"]=integer(kwargs["limit"],20,1000);if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        const url = 'https://creator.douyin.com/web/api/media/aweme/draft/?aid=1128';
        const res = (await browserFetch('GET', url));
        const items = list(res,'aweme_list').slice(0, kwargs.limit);
        return items.map((v) => ({
            aweme_id: v.aweme_id,
            title: v.desc,
            create_time: new Date(v.create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        }));
    });})();
