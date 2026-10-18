/**
 * Saved website passwords for WeWorker 浏览器 auto-login (off by default).
 *
 * - Encrypted with the operating system's per-user key: Windows DPAPI
 *   (CurrentUser scope). Other platforms report "unsupported" until a keychain
 *   backend is added; nothing is ever written in plain text.
 * - Secrets reach PowerShell over stdin, never on the command line.
 * - Only the Bridge process decrypts, right before it types into a login page
 *   over CDP. No interface returns a password to a client, the extension,
 *   Adapter code, the desktop Backend or a model.
 * - Preferences (enabled, masked username, last result) live next to the
 *   ciphertext in autologin.json and contain no secret.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { resolveBrowserHome } from "./dedicated-browser.js";

const SITE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const MAX_USERNAME_LENGTH = 256;
export const MAX_PASSWORD_LENGTH = 1024;

function assertSite(site) {
  if (typeof site !== "string" || !SITE_RE.test(site)) throw new Error("Invalid site.");
  return site;
}

export function maskUsername(value) {
  const text = String(value || "");
  if (!text) return "";
  const at = text.indexOf("@");
  const name = at > 0 ? text.slice(0, at) : text;
  const domain = at > 0 ? text.slice(at) : "";
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}${domain}`;
}

function runPowerShell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      // Never echo stdin or stdout (they may hold the secret) into errors.
      if (code !== 0) reject(new Error(`Windows DPAPI 操作失败（exit ${code}）`));
      else resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
    child.stdin.end(input, "utf8");
  });
}

const PROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$plain=[Console]::In.ReadToEnd()",
  "$bytes=[Text.Encoding]::UTF8.GetBytes($plain)",
  "$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($protected))",
].join(";");

const UNPROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$encoded=[Console]::In.ReadToEnd().Trim()",
  "$protected=[Convert]::FromBase64String($encoded)",
  "$bytes=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($bytes))",
].join(";");

/** Windows DPAPI backend. `protect`/`unprotect` are injectable for tests. */
export function createWindowsDpapi(run = runPowerShell) {
  return {
    supported: true,
    name: "windows-dpapi",
    protect: (plain) => run(PROTECT_SCRIPT, plain),
    unprotect: async (encoded) => Buffer.from(await run(UNPROTECT_SCRIPT, encoded), "base64").toString("utf8"),
  };
}

export function defaultBackend(platform = process.platform) {
  return platform === "win32" ? createWindowsDpapi() : { supported: false, name: "unsupported" };
}

export class CredentialVault {
  constructor({ browserHome = resolveBrowserHome(), backend = defaultBackend(), fileSystem = fs, now = () => Date.now() } = {}) {
    this._dir = path.join(browserHome, "credentials");
    this._prefsFile = path.join(browserHome, "autologin.json");
    this._backend = backend;
    this._fs = fileSystem;
    this._now = now;
  }

  get supported() { return this._backend.supported === true; }
  get backendName() { return this._backend.name; }

  _file(site) { return path.join(this._dir, `${assertSite(site)}.dpapi`); }

  readPreferences() {
    try {
      const parsed = JSON.parse(this._fs.readFileSync(this._prefsFile, "utf8"));
      return parsed && typeof parsed.sites === "object" && parsed.sites ? parsed : { sites: {} };
    } catch {
      return { sites: {} };
    }
  }

  _writePreferences(prefs) {
    this._fs.mkdirSync(path.dirname(this._prefsFile), { recursive: true });
    const temp = `${this._prefsFile}.${process.pid}.tmp`;
    this._fs.writeFileSync(temp, `${JSON.stringify(prefs, null, 2)}\n`, { mode: 0o600 });
    this._fs.renameSync(temp, this._prefsFile);
  }

  /** Per-site preferences without secrets. */
  site(site) {
    const entry = this.readPreferences().sites[assertSite(site)] || {};
    return {
      enabled: entry.enabled === true && this.hasCredential(site),
      configured: this.hasCredential(site),
      username: typeof entry.username_hint === "string" ? entry.username_hint : "",
      savedAt: entry.saved_at || null,
      lastResult: entry.last_result || null,
      lastAttemptAt: entry.last_attempt_at || null,
      dismissed: entry.dismissed === true,
      logins: Number.isInteger(entry.manual_logins) ? entry.manual_logins : 0,
    };
  }

  updateSite(site, patch) {
    const prefs = this.readPreferences();
    const key = assertSite(site);
    prefs.sites[key] = { ...(prefs.sites[key] || {}), ...patch };
    this._writePreferences(prefs);
    return this.site(key);
  }

  hasCredential(site) {
    try { return this._fs.statSync(this._file(site)).isFile(); } catch { return false; }
  }

  async save(site, { username, password }) {
    if (!this.supported) throw new Error("当前系统暂不支持安全保存密码（目前支持 Windows）。");
    const user = String(username ?? "");
    const pass = String(password ?? "");
    if (!user.trim() || user.length > MAX_USERNAME_LENGTH) throw new Error("请填写账号（不超过 256 个字符）。");
    if (!pass || pass.length > MAX_PASSWORD_LENGTH) throw new Error("请填写密码（不超过 1024 个字符）。");
    const encrypted = await this._backend.protect(JSON.stringify({ v: 1, username: user, password: pass }));
    const file = this._file(site);
    this._fs.mkdirSync(this._dir, { recursive: true });
    this._fs.writeFileSync(file, `${encrypted}\n`, { encoding: "utf8", mode: 0o600 });
    return this.updateSite(site, {
      enabled: true, username_hint: maskUsername(user), saved_at: new Date(this._now()).toISOString(),
      last_result: null, last_attempt_at: null, dismissed: false,
    });
  }

  /** Bridge-internal: the only place a password is decrypted. */
  async load(site) {
    if (!this.supported || !this.hasCredential(site)) return null;
    const encrypted = this._fs.readFileSync(this._file(site), "utf8").trim();
    if (!encrypted) return null;
    const parsed = JSON.parse(await this._backend.unprotect(encrypted));
    return typeof parsed?.username === "string" && typeof parsed?.password === "string" ? parsed : null;
  }

  remove(site) {
    const existed = this.hasCredential(site);
    this._fs.rmSync(this._file(site), { force: true });
    this.updateSite(site, { enabled: false, username_hint: "", saved_at: null, last_result: null, last_attempt_at: null });
    return existed;
  }
}
