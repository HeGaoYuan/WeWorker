import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { validateV2AdapterDir } from "../adapter-package-v2.js";
import { buildV2Bootstrap } from "../../extension/background/v2-loader.js";

const root = resolve(import.meta.dirname, "../../adapters/ctrip.com");
const adapter = validateV2AdapterDir(root);

function node(text = "", { one = {}, all = {}, attrs = {}, childNodes = [] } = {}) {
  return {
    textContent: text,
    innerText: text,
    childNodes,
    querySelector: (selector) => one[selector] || null,
    querySelectorAll: (selector) => all[selector] || [],
    getAttribute: (name) => attrs[name] ?? null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

function setup({
  payload = { Response: { searchResults: [] } },
  url = "https://m.ctrip.com/",
  status = 200,
  networkError = false,
  documentOne = {},
  documentAll = {},
  bodyText = "",
  runtimeRequest,
} = {}) {
  const handlers = new Map();
  const requests = [];
  const runtimeCalls = [];
  const assigned = [];
  const parsedUrl = new URL(url);
  const location = {
    href: parsedUrl.href,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
    assign(target) { assigned.push(target); },
  };
  const context = {
    Date,
    Map,
    MutationObserver: class { observe() {} disconnect() {} },
    Proxy,
    Set,
    URL,
    URLSearchParams,
    clearTimeout() {},
    document: {
      body: { innerText: bodyText, scrollHeight: 1000 },
      documentElement: {},
      querySelector: (selector) => documentOne[selector] || null,
      querySelectorAll: (selector) => documentAll[selector] || [],
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (networkError) throw new TypeError("network unavailable");
      return { ok: status === 200, status, json: async () => payload };
    },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    location,
    setTimeout: (callback) => { callback(); return 1; },
    __webmcpRegister: (definition) => {
      for (const tool of definition.tools) handlers.set(tool.name, tool.handler);
    },
  };
  context.window = context;
  context.scrollTo = () => {};
  context.__webmcpWecliRuntime = {
    requestPrivileged: async (action, body) => {
      runtimeCalls.push({ action, body });
      return runtimeRequest ? runtimeRequest(action, body) : {};
    },
  };
  vm.createContext(context);
  vm.runInContext(buildV2Bootstrap(adapter.manifest), context);
  for (const file of readdirSync(resolve(root, "extension/internal")).sort()) {
    vm.runInContext(readFileSync(resolve(root, "extension/internal", file), "utf8"), context);
  }
  for (const command of adapter.commands) {
    vm.runInContext(readFileSync(resolve(root, command.module), "utf8"), context);
  }
  return { assigned, context, handlers, requests, runtimeCalls };
}

describe("Ctrip v2 adapter", () => {
  it("registers every declared command, route, and safety class under the public Profile", () => {
    const { handlers } = setup();
    expect([...handlers.keys()]).toEqual(adapter.commands.map((command) => "ctrip.com." + command.id));
    expect(adapter.commands).toHaveLength(15);
    expect(adapter.commands.filter((command) => command.safety === "write").map((command) => command.id)).toEqual(["login"]);
    expect(new Set(adapter.commands.map((command) => command.routeDomain))).toEqual(new Set(adapter.manifest.match));
    expect(JSON.parse(readFileSync(resolve(root, "../../weworker/build-profile.json"), "utf8")).adapters).toContain("ctrip.com");
    expect(JSON.parse(readFileSync(resolve(root, "../../weworker/package.json"), "utf8")).build.extraResources)
      .toContainEqual({ from: "../docs/third_party/OpenCLI-LICENSE.txt", to: "licenses/OpenCLI-LICENSE.txt" });
  });

  it.each([["search", "D"], ["hotel-suggest", "H"]])("maps %s response and preserves the search type", async (command, type) => {
    const { handlers, requests } = setup({ payload: { Response: { searchResults: [
      { id: 42, type: "City", cityId: 7, cityName: "Example", displayName: " Example  City ", gdLat: 31, gdLon: 121 },
      { id: 43, type: "Hotel", cityId: 7, displayName: "Hotel", commentScore: 4.7 },
    ] } } });
    const rows = await handlers.get("ctrip.com." + command)({ query: " City ", limit: 1 });
    expect(rows).toMatchObject([{ rank: 1, id: "42", name: "Example City", lat: 31, lon: 121, url: "https://you.ctrip.com/place/Example7.html" }]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://m.ctrip.com/restapi/soa2/21881/json/gaHotelSearchEngine");
    expect(requests[0].options.credentials).toBe("omit");
    expect(requests[0].options.redirect).toBe("error");
    expect(JSON.parse(requests[0].options.body)).toMatchObject({ keyword: "City", searchType: type });
  });

  it("rejects invalid input before making a request", async () => {
    const { handlers, requests } = setup();
    for (const params of [{ query: " " }, { query: "x", limit: 0 }, { query: "x", limit: 1.5 }, { query: "x", limit: "5" }]) {
      await expect(handlers.get("ctrip.com.search")(params)).rejects.toMatchObject({ code: "INVALID_ARGS" });
    }
    expect(requests).toHaveLength(0);
  });

  it("requires its declared page host and handles upstream failures", async () => {
    const wrongHost = setup({ url: "https://example.com/" });
    await expect(wrongHost.handlers.get("ctrip.com.search")({ query: "x" })).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
    expect(wrongHost.requests).toHaveLength(0);
    for (const fixture of [{ networkError: true, code: "FETCH_ERROR" }, { status: 403, code: "HTTP_ERROR" }, { payload: { Result: false, ErrorCode: 12 }, code: "COMMAND_EXEC" }, { payload: {}, code: "COMMAND_EXEC" }, { code: "EMPTY_RESULT" }]) {
      const { handlers } = setup(fixture);
      await expect(handlers.get("ctrip.com.search")({ query: "x" })).rejects.toMatchObject({ code: fixture.code });
    }
  });

  it("keeps Cookie values private and applies the write confirmation gate to login", async () => {
    const cookieResult = { cookies: [
      { name: "login_uid", value: "private-login-value" },
      { name: "AHeadUserInfo", value: "UserName=Example%20User&VipGrade=Gold" },
    ] };
    const { handlers } = setup({ url: "https://www.ctrip.com/", runtimeRequest: async () => cookieResult });
    expect(() => handlers.get("ctrip.com.login")({})).toThrow(expect.objectContaining({ code: "CONFIRMATION_REQUIRED" }));
    expect(await handlers.get("ctrip.com.whoami")({})).toEqual({ logged_in: true, site: "ctrip", name: "Example User", vip_grade: "Gold" });
    const loggedIn = await handlers.get("ctrip.com.login")({ __confirmed: true });
    expect(loggedIn).toMatchObject({ status: "already_logged_in", logged_in: true });
    expect(JSON.stringify(loggedIn)).not.toContain("private-login-value");

    const anonymous = setup({ url: "https://www.ctrip.com/", runtimeRequest: async () => ({ cookies: [] }) });
    expect(await anonymous.handlers.get("ctrip.com.login")({ __confirmed: true })).toMatchObject({
      status: "navigating",
      url: "https://passport.ctrip.com/user/login",
    });
    expect(anonymous.assigned).toEqual(["https://passport.ctrip.com/user/login"]);
  });

  it("maps hotel SSR list and detail state without copying page credentials", async () => {
    const listUrl = "https://hotels.ctrip.com/hotels/list?city=7&checkin=2026-10-01&checkout=2026-10-02";
    const list = [{ hotelInfo: { summary: { hotelId: 42 }, nameInfo: { name: "Hotel" }, hotelStar: { star: 5 }, commentInfo: { commentScore: "4.8", commenterNumber: "1,234 reviews" }, positionInfo: { cityName: "Example", mapCoordinate: [{ coordinateType: 1, latitude: "31", longitude: "121" }] } }, roomInfo: [{ priceInfo: { price: 500, currency: "CNY" } }] }];
    const listHarness = setup({ url: listUrl, runtimeRequest: async () => ({ value: list }) });
    expect(await listHarness.handlers.get("ctrip.com.hotel-search")({ city: 7, checkin: "2026-10-01", checkout: "2026-10-02", limit: 1 })).toMatchObject([{ hotelId: "42", name: "Hotel", reviewCount: 1234, lat: 31, lon: 121 }]);

    const detail = { hotelBaseInfo: { masterHotelId: 42, nameInfo: { name: "Hotel", nameEn: "Example Hotel" }, starInfo: { level: 5 }, cityName: "Example" }, hotelPositionInfo: { address: "Example Road", lat: 31, lng: 121 }, hotelComment: { comment: { score: 4.8, totalComment: 12, scoreDetail: [{ showName: "Clean", showScore: "4.9" }] } }, hotelFacilityBelt: { facilityList: [{ facilityDesc: "Wi-Fi" }] }, hotelPolicyInfo: { checkInAndOut: { content: [{ description: "After 14:00" }] } } };
    const detailHarness = setup({ url: "https://hotels.ctrip.com/hotels/detail/?hotelid=42", runtimeRequest: async () => ({ value: detail }) });
    expect(await detailHarness.handlers.get("ctrip.com.hotel")({ id: 42 })).toMatchObject([{ hotelId: "42", name: "Hotel", facilities: "Wi-Fi", ratingBreakdown: "Clean 4.9" }]);
  });

  it.each([
    ["train", "https://trains.ctrip.com/", { from: "A", to: "B", date: "2026-10-01", limit: 1 }],
    ["bus", "https://bus.ctrip.com/", { from: "A", to: "B", date: "2026-10-01", limit: 1 }],
    ["ferry", "https://ship.ctrip.com/", { from: "A", to: "B", date: "2026-10-01", limit: 1 }],
    ["flight-round", "https://flights.ctrip.com/", { from: "BJS", to: "SHA", depart: "2026-10-01", return: "2026-10-02", limit: 1 }],
    ["attraction", "https://you.ctrip.com/", { city: 7, limit: 1 }],
    ["cruise", "https://cruise.ctrip.com/", { port: "Example", limit: 1 }],
    ["tour", "https://vacations.ctrip.com/", { destination: "Example", limit: 1 }],
    ["package", "https://vacations.ctrip.com/", { destination: "Example", limit: 1 }],
  ])("validates and navigates %s through its declared host", async (command, url, params) => {
    const { assigned, handlers } = setup({ url });
    expect(await handlers.get("ctrip.com." + command)(params)).toMatchObject({ status: "navigating" });
    expect(assigned).toHaveLength(1);
    expect(new URL(assigned[0]).hostname).toBe(adapter.commands.find((item) => item.id === command).routeDomain);
  });

  it.each([
    ["hotel-search", { city: 7, checkin: "2026-10-02", checkout: "2026-10-01" }],
    ["hotel", { id: 0 }],
    ["train", { from: "A", to: "A", date: "2026-10-01" }],
    ["bus", { from: "A", to: "B", date: "2026-02-30" }],
    ["ferry", { from: "A", to: "B", date: "2026-10-01", limit: 51 }],
    ["flight", { from: "Beijing", to: "SHA", date: "2026-10-01" }],
    ["flight-round", { from: "BJS", to: "SHA", depart: "2026-10-02", return: "2026-10-01" }],
    ["attraction", { city: -1 }],
    ["cruise", { port: "" }],
    ["tour", { destination: "x".repeat(21) }],
    ["package", { destination: "Example", limit: 1.5 }],
  ])("rejects invalid %s parameters before navigation", async (command, params) => {
    const { assigned, handlers, runtimeCalls } = setup();
    await expect(handlers.get("ctrip.com." + command)(params)).rejects.toMatchObject({ code: "INVALID_ARGS" });
    expect(assigned).toHaveLength(0);
    expect(runtimeCalls).toHaveLength(0);
  });

  it.each([
    ["train", "https://trains.ctrip.com/webapp/train/list?dStationName=A&aStationName=B&dDate=2026-10-01&ticketType=1", { from: "A", to: "B", date: "2026-10-01" }],
    ["hotel-search", "https://hotels.ctrip.com/hotels/list?city=7&checkin=2026-10-01&checkout=2026-10-02", { city: 7, checkin: "2026-10-01", checkout: "2026-10-02" }],
    ["tour", "https://vacations.ctrip.com/list/whole/sc.html?sv=Example", { destination: "Example" }],
  ])("reports verification gates for %s without returning page data", async (command, url, params) => {
    const { handlers } = setup({ url, bodyText: "安全验证 验证码" });
    await expect(handlers.get("ctrip.com." + command)(params)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("extracts train, bus, ferry, round-flight, attraction, cruise, and vacation fixtures", async () => {
    const leaf = (text) => node(text);
    const trainCard = node("", { one: { ".checi": leaf("G1"), ".from .time": leaf("08:00"), ".from .station": leaf("A"), ".to .time": leaf("10:00"), ".to .station": leaf("B"), ".rbox .price": leaf("100"), ".haoshi": leaf("2h") }, all: { ".surplus-list > li": [leaf("Second  available")] } });
    const trainUrl = "https://trains.ctrip.com/webapp/train/list?dStationName=A&aStationName=B&dDate=2026-10-01&ticketType=1";
    const trainHarness = setup({ url: trainUrl, documentOne: { ".card-white.list-item": trainCard }, documentAll: { ".card-white.list-item": [trainCard] } });
    expect(await trainHarness.handlers.get("ctrip.com.train")({ from: "A", to: "B", date: "2026-10-01", limit: 1 })).toMatchObject([{ trainNo: "G1", fromPrice: 100 }]);

    const busCard = node("", { one: { ".list-width150": leaf("07:05"), ".corred": leaf("50"), ".bus-desc": leaf("2h"), ".list-seat-parent": leaf("Available") }, all: { ".list-width200 .cor333": [leaf("A"), leaf("B")] } });
    const busPayload = encodeURIComponent(JSON.stringify({ fromCity: "A", toCity: "B", fromDate: "2026-10-01", fromStation: "", toStation: "" }));
    const busHarness = setup({ url: "https://bus.ctrip.com/list?param=" + busPayload, documentOne: { ".list-item-parent": busCard }, documentAll: { ".list-item-parent": [busCard] } });
    expect(await busHarness.handlers.get("ctrip.com.bus")({ from: "A", to: "B", date: "2026-10-01", limit: 1 })).toMatchObject([{ departureTime: "07:05", price: 50 }]);

    const ferryCard = node("", { one: { ".corred": leaf("220"), ".list-seat-parent": leaf("Available") }, all: { ".list-width400 .font600": [leaf("09:00"), leaf("15:30")], ".list-width400 .font12": [leaf("A Port"), leaf("B Port")], "span.list-width100": [leaf("Ship"), leaf("6h")] } });
    const ferryPayload = encodeURIComponent(JSON.stringify({ fromCityName: "A", toCityName: "B", date: "2026-10-01" }));
    const ferryHarness = setup({ url: "https://ship.ctrip.com/ship/list?param=" + ferryPayload, documentOne: { ".list-item-parent": ferryCard }, documentAll: { ".list-item-parent": [ferryCard] } });
    expect(await ferryHarness.handlers.get("ctrip.com.ferry")({ from: "A", to: "B", date: "2026-10-01", limit: 1 })).toMatchObject([{ shipName: "Ship", fromPort: "A Port", price: 220 }]);

    const chunkText = ["Airline", "MU1234", "A320", "08:00", "A Airport", "10:00", "B Airport", "T2", "¥", "800", "经济舱"];
    const chunks = chunkText.map((text) => ({ nodeType: 3, textContent: text }));
    const flightCard = node(chunkText.join(" "), { childNodes: chunks });
    const roundUrl = "https://flights.ctrip.com/online/list/round-bjs-sha?depdate=2026-10-01_2026-10-02&cabin=Y_S_C_F&adult=1&child=0&infant=0";
    const roundHarness = setup({ url: roundUrl, documentOne: { ".flight-item": flightCard }, documentAll: { ".flight-item": [flightCard] } });
    expect(await roundHarness.handlers.get("ctrip.com.flight-round")({ from: "BJS", to: "SHA", depart: "2026-10-01", return: "2026-10-02", limit: 1 })).toMatchObject([{ airline: "Airline", flightNo: "MU1234", price: 800 }]);

    const attractionLink = node("Example Sight 4.8分 1.2万条点评", { attrs: { href: "/sight/example7/99.html" } });
    const attractionHarness = setup({ url: "https://you.ctrip.com/place/dest7.html", documentAll: { 'a[href*="/sight/"]': [attractionLink, attractionLink, attractionLink] } });
    expect(await attractionHarness.handlers.get("ctrip.com.attraction")({ city: 7, limit: 1 })).toMatchObject([{ name: "Example Sight", reviews: 12000 }]);

    const portLink = node("Example Port", { attrs: { href: "/newpackage/search/s2.html" } });
    const cruiseCard = node("", { one: { ".route_info_star": leaf("5"), ".route_title": leaf("5 Example Cruise"), ".route_setout": leaf("Example Port"), ".route_sailing .txt_link_strong": leaf("2026-10-01"), ".route_price .price": leaf("1,999") }, all: { ".route_info_txt": [leaf("Tag")] } });
    const cruiseHarness = setup({ url: "https://cruise.ctrip.com/newpackage/search/s2.html", documentOne: { ".route_info": cruiseCard }, documentAll: { 'a[href*="/newpackage/search/s"]': [portLink], ".route_info": [cruiseCard] } });
    expect(await cruiseHarness.handlers.get("ctrip.com.cruise")({ port: "Example", limit: 1 })).toMatchObject([{ title: "Example Cruise", price: 1999 }]);

    const vacationCard = node("", { one: { ".list_product_title": node("Tour", { attrs: { title: "Example Tour" } }), ".list_product_subtitle": leaf("Subtitle"), ".list_product_score": leaf("4.9"), ".list_product_travel": leaf("1.2万 sold"), ".list_product_comment": leaf("20 reviews"), ".list_sr_price": leaf("999") }, all: { ".list_label_blue": [leaf("Tag")] } });
    const vacationUrl = "https://vacations.ctrip.com/list/whole/sc.html?sv=Example";
    const vacationHarness = setup({ url: vacationUrl, documentOne: { ".list_product_item": vacationCard }, documentAll: { ".list_product_item": [vacationCard], ".list_sr_price": [leaf("999")] } });
    expect(await vacationHarness.handlers.get("ctrip.com.tour")({ destination: "Example", limit: 1 })).toMatchObject([{ title: "Example Tour", sold: 12000, price: 999 }]);
  });

  it("maps single-flight network capture and starts capture before navigation", async () => {
    const target = "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-10-01&cabin=Y_S_C_F&adult=1&child=0&infant=0";
    const payload = { status: 0, data: { context: { finished: true }, flightItineraryList: [{ itineraryId: "i1", flightSegments: [{ airlineName: "Airline", transferCount: 0, flightList: [{ flightNo: "MU1234", aircraftName: "A320", departureDateTime: "2026-10-01 08:00:00", arrivalDateTime: "2026-10-01 10:00:00", departureAirportName: "A Airport", arrivalAirportName: "B Airport", arrivalTerminal: "T2" }] }], priceList: [{ sortPrice: 800, cabin: "Y" }] }] } };
    const readyCard = node("08:00 ¥800");
    const harness = setup({ url: target, documentOne: { ".flight-item": readyCard }, runtimeRequest: async (action) => action === "network_capture_read" ? { entries: [{ url: "https://flights.ctrip.com/international/search/api/search/batchSearch", responseStatus: 200, responsePreview: JSON.stringify(payload), responseBodyTruncated: false }] } : { started: true } });
    expect(await harness.handlers.get("ctrip.com.flight")({ from: "BJS", to: "SHA", date: "2026-10-01", limit: 1 })).toMatchObject([{ airline: "Airline", flightNo: "MU1234", price: 800, cabin: "经济舱" }]);

    const navigation = setup({ url: "https://flights.ctrip.com/" });
    expect(await navigation.handlers.get("ctrip.com.flight")({ from: "BJS", to: "SHA", date: "2026-10-01", limit: 1 })).toMatchObject({ status: "navigating" });
    expect(navigation.runtimeCalls[0]).toMatchObject({ action: "network_capture_start" });
    expect(navigation.assigned).toEqual([target]);
  });

  it.each([
    [{ responseStatus: 403, responsePreview: "{}" }, "AUTH_REQUIRED"],
    [{ responseStatus: 200, responsePreview: "{}", responseBodyTruncated: true }, "COMMAND_EXEC"],
    [{ responseStatus: 200, responsePreview: "not-json" }, "COMMAND_EXEC"],
    [{ responseStatus: 200, responsePreview: JSON.stringify({ status: 0, data: { context: { finished: false }, flightItineraryList: [] } }) }, "COMMAND_EXEC"],
  ])("maps single-flight capture failures to %s", async (entry, code) => {
    const target = "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-10-01&cabin=Y_S_C_F&adult=1&child=0&infant=0";
    const readyCard = node("08:00 ¥800");
    const harness = setup({
      url: target,
      documentOne: { ".flight-item": readyCard },
      runtimeRequest: async () => ({ entries: [{ url: "https://flights.ctrip.com/international/search/api/search/batchSearch", ...entry }] }),
    });
    await expect(harness.handlers.get("ctrip.com.flight")({ from: "BJS", to: "SHA", date: "2026-10-01" })).rejects.toMatchObject({ code });
  });

  it("recovers a single-flight page that loaded before capture started", async () => {
    const target = "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-10-01&cabin=Y_S_C_F&adult=1&child=0&infant=0";
    const readyCard = node("08:00 ¥800");
    const harness = setup({
      url: target,
      documentOne: { ".flight-item": readyCard },
      runtimeRequest: async (action) => {
        if (action === "network_capture_read") throw Object.assign(new Error("missing"), { code: "CAPTURE_NOT_STARTED" });
        return { started: true };
      },
    });
    expect(await harness.handlers.get("ctrip.com.flight")({ from: "BJS", to: "SHA", date: "2026-10-01" })).toMatchObject({ status: "navigating" });
    expect(harness.runtimeCalls.map((call) => call.action)).toEqual(["network_capture_read", "network_capture_start"]);
    expect(harness.assigned).toEqual([target]);
  });
});
