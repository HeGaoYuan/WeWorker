/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,AuthRequiredError,CommandExecutionError,EmptyResultError,resolveCity,normalizeShopId,wrapDianpingStep,detectAuthOrPageFailure,parseReviewCount,parsePrice,navigate,same,integer,guard,extractSearchRows,extractShopFields}=window.__dianping;__webcliRegisterCommand("search",async (kwargs={}) => {
        const keyword = String(kwargs.keyword || '').trim();
        if (!keyword) throw new ArgumentError('keyword', 'must be a non-empty string');

        const limit = integer(kwargs.limit,15,15);

        if(location.hostname!=='www.dianping.com')return navigate('https://www.dianping.com/');
        const cityId = await wrapDianpingStep(
            'city resolve',
            () => resolveCity(kwargs.city),
        );
        const path = cityId
            ? `/search/keyword/${cityId}/0_${encodeURIComponent(keyword)}`
            : `/search/keyword/0/0_${encodeURIComponent(keyword)}`;
        const url = `https://www.dianping.com${path}`;

        if(!same(url))return navigate(url);guard();

        const result = await wrapDianpingStep(
            `search "${keyword}" extraction`,
            () => extractSearchRows(),
        );

        if (!result || !result.ok) {
            detectAuthOrPageFailure(
                { text: String(result?.sample || ''), url: String(result?.url || url) },
                `search "${keyword}"`,
                { emptyPatterns: [/没有找到|暂无结果|暂无商户|换个关键词|未找到相关/i] },
            );
        }

        const rows = (result.rows || []).slice(0, limit);
        if (rows.length === 0) {
            throw new CommandExecutionError('dianping search parser found no result-shaped shop cards');
        }
        if (rows.some((row) => !row?.shop_id)) {
            throw new CommandExecutionError('dianping search parser found result cards without shop_id values');
        }
        return rows.map((r) => ({
            rank: r.rank,
            shop_id: r.shop_id,
            name: r.name,
            rating: r.starClass ? Number((Number(r.starClass) / 10).toFixed(1)) : null,
            reviews: parseReviewCount(r.reviewsRaw),
            price: parsePrice(r.priceRaw),
            cuisine: r.cuisine,
            district: r.district,
            url: r.url,
        }));
    });})();
