import * as api from "../api.js";
import { esc, toast } from "../util.js";

export async function refreshBrowserStatus() {
  const button = document.getElementById("browserStatus");
  const browser = await api.getBrowserStatus();
  button.dataset.running = browser.running ? "true" : "false";
  const label = browser.running
    ? "浏览器已连接"
    : "打开 Agent 浏览器";
  button.title = browser.running ? `浏览器已连接 (${browser.cdp_url})` : label;
  button.innerHTML = `<span class="dot ${browser.running ? "dot-on" : "dot-off"}"></span><span class="status-label">${esc(label)}</span>`;
  return browser;
}

export function bindBrowserStatus() {
  const button = document.getElementById("browserStatus");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.title = "正在打开 Agent 浏览器…";
    button.innerHTML = `<span class="dot dot-off"></span><span class="status-label">正在打开 Agent 浏览器…</span>`;
    try {
      await api.openBrowser();
      await refreshBrowserStatus();
      toast("Agent 浏览器已打开并聚焦");
    } finally {
      button.disabled = false;
    }
  });
}
