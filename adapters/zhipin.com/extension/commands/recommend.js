/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,AuthRequiredError,EmptyResultError,integer,navigate,same,guard,bossFetch,verbose,selectorError,readPositiveInteger,readRequiredString,checkAuth,checkEnvironment,checkRecruiterSide,assertOk,fetchFriendList,fetchRecommendList,findFriendByUid,clickCandidateInList,typeAndSendMessage,readEncryptSystemId,fetchGeekFriendLabelList,fetchGeekFriendInfoList,findGeekFriendByUid,fetchGeekHistoryMsg,IDENTITY_MISMATCH_CODE}=window.__boss;
const run=async (kwargs) => {

        verbose('Fetching recommended candidates...');

        // Get label definitions for mapping
        const labelData = await bossFetch('https://www.zhipin.com/wapi/zprelation/friend/label/get', {
            allowNonZero: true,
        });
        const labelMap = {};
        if (labelData.code === 0 && labelData.zpData?.labels) {
            for (const l of labelData.zpData.labels) {
                labelMap[l.labelId] = l.label;
            }
        }
        const friends = await fetchRecommendList();
        const limit = kwargs.limit || 20;
        return friends.slice(0, limit).map((f) => ({
            name: f.name || '',
            job_name: f.jobName || '',
            last_time: f.lastTime || '',
            labels: (f.relationLabelList || []).map((id) => labelMap[id] || String(id)).join(', '),
            encrypt_uid: f.encryptUid || '',
            security_id: f.securityId || '',
            encrypt_job_id: f.encryptJobId || '',
        }));
    };
__webcliRegisterCommand("recommend",async(args={})=>{args={...{"limit":20},...args};args["limit"]=integer(args["limit"],20,1000);if(location.hostname!=='www.zhipin.com'||!location.pathname.startsWith('/web/'))return navigate('https://www.zhipin.com/web/chat/index');guard();return run(args);});})();
