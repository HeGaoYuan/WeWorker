(function () {
  const common = new Proxy({}, { get: (_target, key) => window.__ctrip_com_common[key] });
  const runtime = window.__webmcpWecliRuntime;

  async function identity() {
    const result = await runtime.requestPrivileged("cookies_get", {
      url: "https://www.ctrip.com/",
      browserDebugger: false,
      names: ["login_uid", "AHeadUserInfo", "cticket", "DUID", "IsNonUser"]
    });
    const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
    const value = name => cookies.find(cookie => cookie.name === name && cookie.value)?.value || "";
    const guest = value("IsNonUser") === "T";
    // Current web sessions can leave login_uid empty. Require both session and
    // identity cookies plus the explicit non-guest marker for that newer shape.
    const modernSession = value("cticket") && value("DUID") && value("IsNonUser") === "F";
    if (guest || (!value("login_uid") && !modernSession)) {
      common.fail("AUTH_REQUIRED", "No supported Ctrip login state was detected in the connected browser");
    }
    const profileCookie = cookies.find((cookie) => cookie.name === "AHeadUserInfo");
    const profile = new URLSearchParams(profileCookie?.value || "");
    const rawName = profile.get("UserName") || "";
    let name = rawName;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      name = rawName;
    }
    return {
      logged_in: true,
      site: "ctrip",
      name: common.clean(name) || null,
      vip_grade: common.clean(profile.get("VipGrade")) || null
    };
  }

  async function whoami() {
    return identity();
  }

  async function login(params) {
    try {
      return { status: "already_logged_in", ...await identity() };
    } catch (error) {
      if (error.code !== "AUTH_REQUIRED") throw error;
    }
    return common.navigate(
      "https://passport.ctrip.com/user/login",
      "请在浏览器中完成人工登录或验证码；完成后调用 ctrip.com.whoami 验证登录状态。", false
    );
  }

  window.__ctrip_com_auth = { whoami, login };
})();
