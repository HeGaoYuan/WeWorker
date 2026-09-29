/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,navigate,same,guard,integer,bool,list,browserFetch,toUnixSeconds,validateTiming,fetchDouyinUserVideos,fetchDouyinComments}=window.__douyin;

__webcliRegisterCommand("location",async (kwargs={}) => {
kwargs={...{"limit":20},...kwargs};if(typeof kwargs["query"]!=='string'||!kwargs["query"].trim())throw new ArgumentError("query is required");kwargs["limit"]=integer(kwargs["limit"],20,1000);if(location.hostname!=='creator.douyin.com')return navigate('https://creator.douyin.com/creator-micro/content/manage');

        const url = `https://creator.douyin.com/aweme/v1/life/video_api/search/poi/?keyword=${encodeURIComponent(kwargs.query)}&count=${kwargs.limit}&aid=1128`;
        const res = await browserFetch('GET', url);
        return list(res,'poi_list').map(p => ({
            poi_id: p.poi_id,
            name: p.poi_name,
            address: p.address,
            city: p.city_name,
        }));
    });})();
