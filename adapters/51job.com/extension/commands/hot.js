/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,WE_ORIGIN,JOBS_ORIGIN,SALARY_CODES,WORKYEAR_CODES,DEGREE_CODES,COMPANY_TYPE_CODES,COMPANY_SIZE_CODES,SORT_CODES,buildSearchUrl,mapJobItem,resolveCity,resolveCode,parseCompanyJobCard,pageFetchJson,integer,navigate,same,guard}=window.__job51;__webcliRegisterCommand("hot",async (kwargs={}) => {

        const limit = integer(kwargs.limit,20,50);
        const pageNum = integer(kwargs.page,1,1000);
        const jobArea = resolveCity(kwargs.area);
        const sortType = resolveCode(kwargs.sort, SORT_CODES, '0');

        const currentUrl = location.href;
        if (!String(currentUrl).startsWith(WE_ORIGIN)) {
            if (!same(`${WE_ORIGIN}/pc/search?searchType=2`)) return navigate(`${WE_ORIGIN}/pc/search?searchType=2`); guard();
        }

        const url = buildSearchUrl({
            keyword: '', jobArea, sortType,
            pageNum, pageSize: Math.min(limit, 50),
        });
        const data = await pageFetchJson(url);
        if (data.status !== '1' && data.status !== 1) {
            throw new CliError('API_ERROR', `51job hot failed: ${data.message ?? 'unknown'}`);
        }
        const items=data?.resultbody?.job?.items;if(!Array.isArray(items))throw new CliError('PARSE_ERROR','51job missing job.items');
        if (items.length === 0) throw new CliError('NO_DATA', 'No recommended jobs returned');
        return items.slice(0, limit).map((it, i) => mapJobItem(it, (pageNum - 1) * limit + i + 1));
    });})();
