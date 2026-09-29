/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,AuthRequiredError,EmptyResultError,integer,navigate,same,guard,bossFetch,verbose,selectorError,readPositiveInteger,readRequiredString,checkAuth,checkEnvironment,checkRecruiterSide,assertOk,fetchFriendList,fetchRecommendList,findFriendByUid,clickCandidateInList,typeAndSendMessage,readEncryptSystemId,fetchGeekFriendLabelList,fetchGeekFriendInfoList,findGeekFriendByUid,fetchGeekHistoryMsg,IDENTITY_MISMATCH_CODE}=window.__boss;
const run=async (kwargs) => {

        verbose('Fetching job list...');

        const data = await bossFetch('https://www.zhipin.com/wapi/zpjob/job/chatted/jobList');
        const jobs = data.zpData || [];
        return jobs.map((j) => ({
            job_name: j.jobName || '',
            salary: j.salaryDesc || '',
            city: j.address || '',
            status: j.jobOnlineStatus === 1 ? '在线' : '已关闭',
            encrypt_job_id: j.encryptJobId || '',
        }));
    };
__webcliRegisterCommand("joblist",async(args={})=>{args={...{},...args};if(location.hostname!=='www.zhipin.com'||!location.pathname.startsWith('/web/'))return navigate('https://www.zhipin.com/web/chat/index');guard();return run(args);});})();
