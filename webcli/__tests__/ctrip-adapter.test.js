import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { validateV2AdapterDir } from "../adapter-package-v2.js";
import { buildV2Bootstrap } from "../../extension/background/v2-loader.js";

const root = resolve(import.meta.dirname, "../../adapters/ctrip.com");
const adapter = validateV2AdapterDir(root);

function setup({ payload = { Response: { searchResults: [] } }, hostname = "m.ctrip.com", status = 200, networkError = false } = {}) {
  const handlers = new Map();
  const requests = [];
  const context = {
    location: { hostname },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (networkError) throw new TypeError("network unavailable");
      return { ok: status === 200, status, json: async () => payload };
    },
    __webmcpRegister: (definition) => {
      for (const tool of definition.tools) handlers.set(tool.name, tool.handler);
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(buildV2Bootstrap(adapter.manifest), context);
  vm.runInContext(readFileSync(resolve(root, "extension/internal/suggest.js"), "utf8"), context);
  for (const command of adapter.commands) {
    vm.runInContext(readFileSync(resolve(root, command.module), "utf8"), context);
  }
  return { handlers, requests };
}

describe("Ctrip v2 adapter", () => {
  it("registers precisely the declared read commands under the public Profile", () => {
    const { handlers } = setup();
    expect([...handlers.keys()]).toEqual(adapter.commands.map((command) => "ctrip.com." + command.id));
    expect(adapter.commands.every((command) => command.safety === "read")).toBe(true);
    expect(adapter.manifest.match).toEqual(["m.ctrip.com"]);
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
    const wrongHost = setup({ hostname: "example.com" });
    await expect(wrongHost.handlers.get("ctrip.com.search")({ query: "x" })).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
    expect(wrongHost.requests).toHaveLength(0);
    for (const fixture of [{ networkError: true, code: "FETCH_ERROR" }, { status: 403, code: "HTTP_ERROR" }, { payload: { Result: false, ErrorCode: 12 }, code: "COMMAND_EXEC" }, { payload: {}, code: "COMMAND_EXEC" }, { code: "EMPTY_RESULT" }]) {
      const { handlers } = setup(fixture);
      await expect(handlers.get("ctrip.com.search")({ query: "x" })).rejects.toMatchObject({ code: fixture.code });
    }
  });
});
