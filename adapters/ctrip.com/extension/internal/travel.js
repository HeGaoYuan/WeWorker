(function () {
  const common = new Proxy({}, { get: (_target, key) => window.__ctrip_com_common[key] });

  function limit(params) {
    return common.integer("limit", params.limit, 20, 1, 50);
  }

  function numberText(value) {
    const text = String(value || "");
    const tenThousands = text.match(/([\d.]+)\s*万/);
    if (tenThousands) return Math.round(Number(tenThousands[1]) * 10000);
    const digits = text.replace(/[^0-9.]/g, "");
    return digits ? Number(digits) : null;
  }

  async function attraction(params) {
    const city = common.positiveInteger("city", params.city);
    const resultLimit = limit(params);
    const target = `https://you.ctrip.com/place/dest${city}.html`;
    const current = new URL(location.href);
    if (current.hostname !== "you.ctrip.com" || !new RegExp(`${city}\\.html$`).test(current.pathname)) return common.navigate(target);
    const state = await common.waitFor(() => {
      if (common.hasCaptcha()) return "captcha";
      const count = Array.from(document.querySelectorAll('a[href*="/sight/"]')).filter((link) => {
        const match = (link.getAttribute("href") || "").match(/\/sight\/([^/]+)\/\d+\.html/);
        return match && (match[1].match(/(\d+)$/) || [])[1] === String(city);
      }).length;
      return count > 2 ? "content" : null;
    }, 15000);
    if (state === "captcha") common.fail("AUTH_REQUIRED", "Ctrip is asking for verification; complete it in the browser and retry");
    if (state !== "content") common.fail("COMMAND_EXEC", `Ctrip did not render attractions for city ${city}`);
    const seen = new Set();
    const rows = [];
    for (const link of document.querySelectorAll('a[href*="/sight/"]')) {
      let url;
      try {
        url = new URL(link.getAttribute("href") || "", "https://you.ctrip.com");
      } catch {
        continue;
      }
      const match = url.pathname.match(/^\/sight\/([^/]+)\/(\d+)\.html$/);
      const citySegment = match?.[1]?.match(/(\d+)$/);
      if (url.protocol !== "https:" || url.hostname !== "you.ctrip.com" || citySegment?.[1] !== String(city) || seen.has(match[2])) continue;
      const full = common.clean(link.textContent);
      const rating = full.match(/([\d.]+)\s*分/);
      const reviews = full.match(/([\d.,]+[wW万]?)\s*条点评/);
      if (!rating && !reviews) continue;
      const markers = [rating?.[0], reviews?.[0]].filter(Boolean).map((marker) => full.indexOf(marker));
      const name = common.clean(full.slice(0, Math.min(...markers)));
      if (!name) continue;
      seen.add(match[2]);
      const rawReviews = reviews?.[1] || "";
      const reviewNumber = Number(rawReviews.replace(/[wW万,]/g, ""));
      rows.push({
        rank: rows.length + 1,
        name,
        rating: rating ? Number(rating[1]) : null,
        reviews: Number.isFinite(reviewNumber) ? (/[wW万]/.test(rawReviews) ? Math.round(reviewNumber * 10000) : reviewNumber) : null,
        url: url.toString()
      });
      if (rows.length >= resultLimit) break;
    }
    if (!rows.length) common.fail("COMMAND_EXEC", "Ctrip attraction links were missing required fields");
    return rows;
  }

  async function cruise(params) {
    const port = common.place("port", params.port);
    const resultLimit = limit(params);
    const indexUrl = "https://cruise.ctrip.com/newpackage/search/s2.html";
    const pathMatch = location.hostname === "cruise.ctrip.com" ? location.pathname.match(/^\/newpackage\/search\/s(\d+)\.html$/) : null;
    if (!pathMatch) return common.navigate(indexUrl, "正在打开邮轮出发港索引；加载后使用相同参数再次调用。");
    const state = await common.waitFor(() => {
      if (common.hasCaptcha()) return "captcha";
      if (document.querySelector(".route_info")) return "content";
      if (/没有找到符合条件|共0个产品|暂无符合/.test(document.body?.innerText || "")) return "empty";
      return null;
    }, 12000);
    if (state === "captcha") common.fail("AUTH_REQUIRED", "Ctrip is asking for verification; complete it in the browser and retry");
    if (state !== "content" && state !== "empty") common.fail("COMMAND_EXEC", `Ctrip cruise page did not render (${state})`);
    let portCode = null;
    for (const link of document.querySelectorAll('a[href*="/newpackage/search/s"]')) {
      if (!(link.textContent || "").includes(port)) continue;
      portCode = ((link.getAttribute("href") || "").match(/\/s(\d+)\.html/) || [])[1] || null;
      if (portCode) break;
    }
    if (!portCode) common.fail("EMPTY_RESULT", `No cruise departure port matching ${port}`);
    if (pathMatch[1] !== portCode) return common.navigate(`https://cruise.ctrip.com/newpackage/search/s${portCode}.html`, "已识别出发港；正在打开对应线路页，加载后使用相同参数再次调用。");
    if (state === "empty") common.fail("EMPTY_RESULT", `No cruises currently departing ${port}`);
    const rows = Array.from(document.querySelectorAll(".route_info")).map((card) => {
      const starText = common.text(card.querySelector(".route_info_star"));
      let title = common.text(card.querySelector(".route_title"));
      if (starText && title.startsWith(starText)) title = title.slice(starText.length).trim();
      if (!title) return null;
      const priceDigits = (common.text(card.querySelector(".route_price .price")).match(/\d[\d,]*/) || [""])[0].replace(/,/g, "");
      return {
        title,
        star: /^\d$/.test(starText) ? Number(starText) : null,
        boarding: common.text(card.querySelector(".route_setout")) || null,
        sailingDate: common.text(card.querySelector(".route_sailing .txt_link_strong")) || null,
        tags: Array.from(card.querySelectorAll(".route_info_txt")).map(common.text).filter(Boolean).join(" / ") || null,
        price: priceDigits ? Number(priceDigits) : null
      };
    }).filter(Boolean);
    if (!rows.length) common.fail("COMMAND_EXEC", "Ctrip cruise cards were missing itinerary fields");
    return rows.slice(0, resultLimit).map((row, index) => ({ rank: index + 1, ...row, url: location.href }));
  }

  async function vacations(params, section, label) {
    const destination = common.place("destination", params.destination);
    const resultLimit = limit(params);
    const target = `https://vacations.ctrip.com/list/${section}/sc.html?${new URLSearchParams({ sv: destination }).toString()}`;
    const current = new URL(location.href);
    const expected = new URL(target);
    // The site appends its selected departure city during canonicalization.
    // Retain it as result context; do not navigate back just to remove it.
    const matches = current.origin === expected.origin && current.pathname === expected.pathname
      && current.searchParams.getAll("sv").length === 1 && current.searchParams.get("sv") === destination
      && [...current.searchParams.keys()].every(key => ["sv", "startcity"].includes(key));
    if (!matches) return common.navigate(target);
    const state = await common.waitFor(() => {
      if (common.hasCaptcha()) return "captcha";
      const items = document.querySelectorAll(".list_product_item").length;
      if (items > 0 && document.querySelectorAll(".list_sr_price").length >= items) return "content";
      if (/没有找到|暂无相关|没有符合|无搜索结果/.test(document.body?.innerText || "")) return "empty";
      return null;
    }, 15000);
    if (state === "captcha") common.fail("AUTH_REQUIRED", "Ctrip is asking for verification; complete it in the browser and retry");
    if (state === "empty") common.fail("EMPTY_RESULT", `No ${label} results for ${destination}`);
    if (state !== "content") common.fail("COMMAND_EXEC", `Ctrip ${label} page did not render (${state})`);
    const rows = Array.from(document.querySelectorAll(".list_product_item")).map((card) => {
      const titleElement = card.querySelector(".list_product_title");
      const title = titleElement ? titleElement.getAttribute("title") || common.text(titleElement) : "";
      if (!title) return null;
      return {
        title,
        productType: common.text(card.querySelector(".list_product_name")) || null,
        departureCity: common.text(card.querySelector(".list_product_place")) || null,
        subtitle: common.text(card.querySelector(".list_product_subtitle")) || null,
        tags: Array.from(card.querySelectorAll(".list_label_blue")).map(common.text).filter(Boolean).join(" / ") || null,
        score: numberText(common.text(card.querySelector(".list_product_score"))),
        sold: numberText(common.text(card.querySelector(".list_product_travel"))),
        reviews: numberText(common.text(card.querySelector(".list_product_comment"))),
        price: numberText(common.text(card.querySelector(".list_sr_price")))
      };
    }).filter(Boolean);
    if (!rows.length) common.fail("COMMAND_EXEC", `Ctrip ${label} cards were missing titles`);
    // The free-travel page can mix private-group recommendations into its list.
    // Use the displayed type, not the page category or words in a product title.
    const matching = section === "freetravel" ? rows.filter(row => row.productType === "自由行" || row.productType === "目的地自由行") : rows;
    if (!matching.length) {
      if (!rows.some(row => row.productType)) common.fail("COMMAND_EXEC", "Ctrip package cards have no product type labels; cannot verify independent travel");
      common.fail("EMPTY_RESULT", "No explicitly labeled independent-travel packages on the current result page");
    }
    return matching.slice(0, resultLimit).map((row, index) => ({ rank: index + 1, ...row, departureCityId: current.searchParams.get("startcity"), url: current.href }));
  }

  window.__ctrip_com_travel = {
    attraction,
    cruise,
    tour: (params) => vacations(params, "whole", "tour"),
    package: (params) => vacations(params, "freetravel", "package")
  };
})();
