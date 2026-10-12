(function () {
  const common = new Proxy({}, { get: (_target, key) => window.__ctrip_com_common[key] });
  const runtime = window.__webmcpWecliRuntime;

  function coordinate(entries) {
    if (!Array.isArray(entries)) return { lat: null, lon: null };
    const ordered = [...entries].sort((left, right) => {
      const rank = (entry) => ({ 1: 0, 2: 1, 3: 2 }[Number(entry?.coordinateType)] ?? 3);
      return rank(left) - rank(right);
    });
    for (const entry of ordered) {
      const lat = Number(entry?.latitude);
      const lon = Number(entry?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return { lat, lon };
    }
    return { lat: null, lon: null };
  }

  function mapHotel(entry, index) {
    const hotelInfo = entry?.hotelInfo || {};
    const summary = hotelInfo.summary || {};
    const nameInfo = hotelInfo.nameInfo || {};
    const starInfo = hotelInfo.hotelStar || {};
    const commentInfo = hotelInfo.commentInfo || {};
    const positionInfo = hotelInfo.positionInfo || {};
    const priceInfo = (Array.isArray(entry?.roomInfo) ? entry.roomInfo[0]?.priceInfo : null) || {};
    const hotelId = summary.hotelId ? String(summary.hotelId) : null;
    const coords = coordinate(positionInfo.mapCoordinate);
    const reviewDigits = String(commentInfo.commenterNumber || "").replace(/[^\d]/g, "");
    const score = Number(commentInfo.commentScore);
    return {
      rank: index + 1,
      hotelId,
      name: common.clean(nameInfo.name) || null,
      enName: common.clean(nameInfo.enName) || null,
      star: Number.isFinite(starInfo.star) && starInfo.star > 0 ? starInfo.star : null,
      score: Number.isFinite(score) && score > 0 ? score : null,
      scoreLabel: common.clean(commentInfo.commentDescription) || null,
      reviewCount: reviewDigits ? Number(reviewDigits) : null,
      cityName: common.clean(positionInfo.cityName) || null,
      district: common.clean(positionInfo.positionDesc) || null,
      address: common.clean(positionInfo.address) || null,
      lat: coords.lat,
      lon: coords.lon,
      price: Number.isFinite(priceInfo.price) && priceInfo.price > 0 ? priceInfo.price : null,
      currency: common.clean(priceInfo.currency) || null,
      url: hotelId ? `https://hotels.ctrip.com/hotels/detail/?hotelid=${encodeURIComponent(hotelId)}` : null
    };
  }

  async function mainValue(expression, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (common.hasCaptcha()) common.fail("AUTH_REQUIRED", "Ctrip is asking for verification; complete it in the browser and retry");
      const result = await runtime.requestPrivileged("main_world_eval", { expression });
      if (result?.value !== undefined && result.value !== null) return result.value;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    common.fail("COMMAND_EXEC", "Ctrip hotel page did not expose the expected SSR state");
  }

  function hasQuery(pathname, expected) {
    const current = new URL(location.href);
    if (current.hostname !== "hotels.ctrip.com" || current.pathname !== pathname) return false;
    return Object.entries(expected).every(([name, value]) => current.searchParams.get(name) === String(value));
  }

  async function search(params) {
    const city = common.positiveInteger("city", params.city);
    const checkin = common.date("checkin", params.checkin);
    const checkout = common.date("checkout", params.checkout);
    if (checkin >= checkout) common.fail("INVALID_ARGS", "checkin must be earlier than checkout");
    const limit = common.integer("limit", params.limit, 10, 1, 30);
    const target = `https://hotels.ctrip.com/hotels/list?city=${city}&checkin=${checkin}&checkout=${checkout}`;
    if (!hasQuery("/hotels/list", { city, checkin, checkout })) return common.navigate(target);
    const rows = await mainValue("window.__NEXT_DATA__?.props?.pageProps?.initListData?.hotelList ?? null", 5000);
    if (!Array.isArray(rows)) common.fail("COMMAND_EXEC", "Ctrip hotel list SSR state is malformed");
    if (rows.length === 0) common.fail("EMPTY_RESULT", `No hotels for city ${city} on ${checkin} to ${checkout}`);
    const mapped = rows.map(mapHotel).filter((row) => row.hotelId && row.name).slice(0, limit);
    if (!mapped.length) common.fail("COMMAND_EXEC", "Ctrip hotel rows were missing hotel IDs or names");
    return mapped;
  }

  function valueOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number !== 0 ? number : null;
  }

  async function detail(params) {
    const id = common.positiveInteger("id", params.id);
    const target = `https://hotels.ctrip.com/hotels/detail/?hotelid=${id}`;
    if (!hasQuery("/hotels/detail/", { hotelid: id })) return common.navigate(target);
    const detailState = await mainValue("window.__NEXT_DATA__?.props?.pageProps?.hotelDetailResponse ?? null", 8000);
    if (!detailState || typeof detailState !== "object") common.fail("COMMAND_EXEC", "Ctrip hotel detail SSR state is malformed");
    const base = detailState.hotelBaseInfo || {};
    const names = base.nameInfo || {};
    const star = base.starInfo || {};
    const position = detailState.hotelPositionInfo || {};
    const comment = detailState.hotelComment?.comment || {};
    const row = {
      hotelId: base.masterHotelId != null ? String(base.masterHotelId) : null,
      name: common.clean(names.name) || null,
      enName: common.clean(names.nameEn) || null,
      star: Number.isFinite(star.level) && star.level > 0 ? star.level : null,
      score: valueOrNull(comment.score),
      scoreLabel: common.clean(comment.scoreDescription) || null,
      reviewCount: Number.isFinite(comment.totalComment) && comment.totalComment > 0 ? comment.totalComment : null,
      ratingBreakdown: (Array.isArray(comment.scoreDetail) ? comment.scoreDetail : []).map((item) => item?.showName && item?.showScore ? `${common.clean(item.showName)} ${common.clean(item.showScore)}` : null).filter(Boolean).join(" / ") || null,
      facilities: (Array.isArray(detailState.hotelFacilityBelt?.facilityList) ? detailState.hotelFacilityBelt.facilityList : []).map((item) => common.clean(item?.facilityDesc)).filter(Boolean).join(" / ") || null,
      checkInOut: (Array.isArray(detailState.hotelPolicyInfo?.checkInAndOut?.content) ? detailState.hotelPolicyInfo.checkInAndOut.content : []).map((item) => common.clean(item?.description)).filter(Boolean).join(" / ") || null,
      cityName: common.clean(base.cityName) || null,
      address: common.clean(position.address) || null,
      lat: valueOrNull(position.lat),
      lon: valueOrNull(position.lng),
      url: target
    };
    if (!row.hotelId || !row.name) common.fail("EMPTY_RESULT", `No hotel detail for ID ${id}`);
    return [row];
  }

  window.__ctrip_com_hotel = { search, detail };
})();
