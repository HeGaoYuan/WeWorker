// 应用入口：顶栏 + 左栏 Toolkit Tree + 三工作区，state 变化驱动重渲染。

import * as api from "./api.js";
import { state, setState, subscribe } from "./state.js";
import { esc, toast } from "./util.js";
import { bindToolkitNavigation, renderToolkitTree } from "./components/toolkit_tree.js";
import { bindBrowserStatus, refreshBrowserStatus } from "./components/browser_status.js";
import { bindActivityStatus, refreshActivity } from "./components/activity_status.js";
import { bindLightbox } from "./components/lightbox.js";
import { renderExplore } from "./views/explore.js";
import { renderDevelop } from "./views/develop.js?v=21";
import { renderDebug } from "./views/debug.js?v=3";

const WORKSPACES = [
  { id: "explore", label: "探索", render: renderExplore },
  { id: "develop", label: "开发", render: renderDevelop },
  { id: "debug", label: "Adapter 验证", render: renderDebug },
];

const $ = (id) => document.getElementById(id);
let canInstallToWeWorker = false;

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  toast(event.reason?.message || String(event.reason || "操作失败"));
});

async function init() {
  try {
    initTheme();
    bindBrowserStatus();
    bindActivityStatus();
    bindLightbox();
    bindToolkitNavigation();
    bindGlobalActions();
    const health = await api.getHealth();
    canInstallToWeWorker = health.capabilities?.install_to_weworker === true;
    $("installToWeWorkerBtn").hidden = !canInstallToWeWorker;
    const toolkits = await api.listToolkits();
    const firstKit = toolkits[0];
    let firstTool = null;
    if (firstKit) {
      const tools = await api.listTools(firstKit.toolkit_id);
      firstTool = tools[0];
    }
    setState({
      toolkitId: firstKit ? firstKit.toolkit_id : null,
      toolId: firstTool ? firstTool.tool_id : null,
    });
    subscribe(onStateChange);
    await refreshGlobalStatus();
    await onStateChange();
  } catch (error) {
    showError(error);
  }
}

function renderTabs() {
  $("tabs").innerHTML = WORKSPACES.map((w) =>
    `<button class="tab ${w.id === state.workspace ? "active" : ""}" data-ws="${w.id}" aria-selected="${w.id === state.workspace}">${w.label}</button>`).join("");
  $("tabs").querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setState({ workspace: btn.dataset.ws })));
}

async function onStateChange() {
  try {
    renderTabs();
    await renderContext();
    await renderToolkitTree($("tree"));
    await refreshExportStatus();
    const ws = WORKSPACES.find((w) => w.id === state.workspace);
    if (!state.toolId) {
      $("workspace").innerHTML = `<div class="ws-empty">请先在左侧选择或创建一个 Tool</div>`;
      return;
    }
    await ws.render($("workspace"));
  } catch (error) {
    showError(error);
  }
}

async function renderContext() {
  const target = $("workspaceContext");
  if (!state.toolkitId) {
    target.textContent = "—";
    target.title = "";
    return;
  }
  const toolkit = await api.getToolkit(state.toolkitId);
  const tool = state.toolId ? await api.getTool(state.toolkitId, state.toolId) : null;
  const label = tool ? `${toolkit.name} / ${tool.name}` : toolkit.name;
  target.textContent = label;
  target.title = label;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  toast(message);
  if ($("workspace")) {
    $("workspace").innerHTML = `<div class="ws-empty danger-text">${esc(message)}</div>`;
  }
}

function initTheme() {
  const saved = localStorage.getItem("ww-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ww-theme", next);
  });
}

async function refreshGlobalStatus() {
  await Promise.all([refreshBrowserStatus(), refreshActivity()]);
}

async function refreshExportStatus() {
  const progress = $("exportProgress");
  const button = $("exportToolkitBtn");
  const installButton = $("installToWeWorkerBtn");
  if (!state.toolkitId) {
    progress.textContent = "";
    button.disabled = true;
    button.title = "请先选择 Adapter";
    installButton.disabled = true;
    installButton.title = "请先选择 Adapter";
    return;
  }
  const status = await api.getExportStatus(state.toolkitId);
  const verified = status.tools.filter((tool) => tool.verified).length;
  progress.textContent = `正式验证 ${verified}/${status.tools.length}`;
  progress.classList.toggle("complete", status.export_eligible);
  progress.title = status.unverified_tools.length
    ? `未验证 Tool：${status.unverified_tools.join("、")}`
    : status.export_eligible ? "当前 Adapter 已完成正式验证" : "Adapter 还没有正式 Tool";
  button.disabled = !status.export_eligible || state.activity.running;
  button.title = state.activity.running
    ? "当前有其他活动运行中"
    : status.export_eligible
    ? "导出当前正式产物"
    : status.unverified_tools.length
      ? `未验证 Tool：${status.unverified_tools.join("、")}`
      : "Adapter 还没有正式 Tool";
  installButton.disabled = !canInstallToWeWorker || !status.export_eligible || state.activity.running;
  installButton.title = state.activity.running
    ? "当前有其他活动运行中"
    : status.export_eligible
    ? "安装当前正式产物"
    : button.title;
}

function bindGlobalActions() {
  $("exportToolkitBtn").addEventListener("click", () => {
    if (!state.toolkitId) return;
    window.location.assign(api.exportToolkitUrl(state.toolkitId));
  });
  $("installToWeWorkerBtn").addEventListener("click", async () => {
    if (!state.toolkitId) return;
    const button = $("installToWeWorkerBtn");
    button.disabled = true;
    try {
      const result = await api.installToolkitToWeWorker(state.toolkitId);
      const messages = {
        installed: "已安装到 WeWorker",
        updated: "已更新 WeWorker 中的 Adapter",
        unchanged: "WeWorker 中已是最新版本",
      };
      toast(messages[result.status] || "Adapter 已安装到 WeWorker");
    } catch (error) {
      toast(error.message);
    } finally {
      await refreshExportStatus();
    }
  });
  window.addEventListener("focus", () =>
    Promise.all([refreshGlobalStatus(), refreshExportStatus()]).catch((error) => toast(error.message)));
}

init();
