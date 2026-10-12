/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;

__webcliRegisterCommand("activities",async (kwargs={}) => {
kwargs={...{},...kwargs};if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        const url = 'https://creator.douyin.com/web/api/media/activity/get/?aid=1128';
        const res = await browserFetch('GET', url);
        return list(res,'activity_list').map(a => ({
            activity_id: a.activity_id,
            title: a.title ?? a.activity_name ?? '',
            end_time: typeof a.end_time === 'number'
                ? new Date(a.end_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                : (a.show_end_time ?? ''),
        }));
    });})();
