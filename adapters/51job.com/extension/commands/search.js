/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,WE_ORIGIN,JOBS_ORIGIN,SALARY_CODES,WORKYEAR_CODES,DEGREE_CODES,COMPANY_TYPE_CODES,COMPANY_SIZE_CODES,SORT_CODES,buildSearchUrl,mapJobItem,resolveCity,resolveCode,parseCompanyJobCard,pageFetchJson,integer,navigate,same,guard}=window.__job51;__webcliRegisterCommand("search",async (kwargs={}) => {

        const keyword = String(kwargs.keyword ?? '').trim();
        if (!keyword) throw new CliError('INVALID_ARGUMENT', 'keyword is required');
        const limit = integer(kwargs.limit,20,50);
        const pageNum = integer(kwargs.page,1,1000);

        const jobArea = resolveCity(kwargs.area);
        const salary = resolveCode(kwargs.salary, SALARY_CODES);
        const workYear = resolveCode(kwargs.experience, WORKYEAR_CODES);
        const degree = resolveCode(kwargs.degree, DEGREE_CODES);
        const companyType = resolveCode(kwargs.companyType, COMPANY_TYPE_CODES);
        const companySize = resolveCode(kwargs.companySize, COMPANY_SIZE_CODES);
        const sortType = resolveCode(kwargs.sort, SORT_CODES, '0');

        // Establish WAF-clean origin. Reusing the same tab avoids the slider
        // challenge fire every call.
        const currentUrl = location.href;
        if (!String(currentUrl).startsWith(WE_ORIGIN)) {
            if (!same(`${WE_ORIGIN}/pc/search?keyword=${encodeURIComponent(keyword)}&searchType=2`)) return navigate(`${WE_ORIGIN}/pc/search?keyword=${encodeURIComponent(keyword)}&searchType=2`); guard();
        }

        const url = buildSearchUrl({
            keyword, jobArea, salary, workYear, degree,
            companyType, companySize, sortType,
            pageNum, pageSize: Math.min(limit, 50),
        });

        const data = await pageFetchJson(url);
        if (data.status !== '1' && data.status !== 1) {
            throw new CliError('API_ERROR', `51job search failed: ${data.message ?? 'unknown'}`);
        }
        const items=data?.resultbody?.job?.items;if(!Array.isArray(items))throw new CliError('PARSE_ERROR','51job missing job.items');
        if (items.length === 0) {
            throw new CliError('NO_DATA', `No jobs matched "${keyword}"`);
        }
        return items.slice(0, limit).map((it, i) => mapJobItem(it, (pageNum - 1) * limit + i + 1));
    });})();
