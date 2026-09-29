/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;

__webcliRegisterCommand("collections",async (kwargs={}) => {
kwargs={...{"limit":20},...kwargs};kwargs["limit"]=integer(kwargs["limit"],20,1000);if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        const url = `https://creator.douyin.com/web/api/mix/list/?status=0,1,2,3,6&count=${kwargs.limit}&cursor=0&should_query_new_mix=1&device_platform=web&aid=1128`;
        const res = await browserFetch('GET', url);
        return list(res,'mix_list').map(m => ({
            mix_id: m.mix_id,
            name: m.mix_name,
            item_count: m.item_count,
        }));
    });})();
