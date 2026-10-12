/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,AuthRequiredError,CommandExecutionError,EmptyResultError,resolveCity,normalizeShopId,wrapDianpingStep,detectAuthOrPageFailure,parseReviewCount,parsePrice,navigate,same,integer,guard,extractSearchRows,extractShopFields}=window.__dianping;__webcliRegisterCommand("shop",async (kwargs={}) => {
        const shopId = normalizeShopId(kwargs.shop_id);

        const url = `https://www.dianping.com/shop/${shopId}`;
        if(!same(url))return navigate(url);guard();

        const data = await wrapDianpingStep(
            `shop ${shopId} extraction`,
            () => extractShopFields(),
        );

        if (!data || !data.ok) {
            detectAuthOrPageFailure(
                { text: String(data?.sample || ''), url: String(data?.url || url) },
                `shop ${shopId}`,
                { emptyPatterns: [/商户不存在|店铺不存在|店铺已关闭|页面不存在|404|已下线|没有找到相关商户/i] },
            );
        }

        const rating = data.rating ? Number(data.rating) : null;
        const reviews = parseReviewCount(data.reviewsRaw);
        const price = parsePrice(data.priceRaw);
        const breakdown = data.breakdown || {};

        const fields = [
            ['shop_id', shopId],
            ['name', data.name || ''],
            ['rating', Number.isFinite(rating) ? rating : null],
            ['reviews', reviews],
            ['price', price],
            ['rank', data.rank || ''],
            ['taste', Number.isFinite(breakdown['口味']) ? breakdown['口味'] : null],
            ['environment', Number.isFinite(breakdown['环境']) ? breakdown['环境'] : null],
            ['service', Number.isFinite(breakdown['服务']) ? breakdown['服务'] : null],
            ['ingredients', Number.isFinite(breakdown['食材']) ? breakdown['食材'] : null],
            ['hours', data.hours || ''],
            ['address', data.address || ''],
            ['subway', data.subway || ''],
            ['features', (data.features || []).join(', ')],
            ['url', data.url || url],
        ];

        return fields.map(([field, value]) => ({ field, value }));
    });})();
