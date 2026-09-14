// 全局 Toolkit／Tool 两级导航树。搜索和展开状态只属于前端展示。

import * as api from "../api.js";
import { state, setState } from "../state.js";
import { esc, toast } from "../util.js";
import { openModal } from "./modal.js";

const expandedToolkitIds = new Set();
let searchValue = "";

export function bindToolkitNavigation() {
  document.getElementById("newToolkitBtn").addEventListener("click", openCreateToolkitModal);
  document.getElementById("toolkitSearchInput").addEventListener("input", (event) => {
    searchValue = event.target.value.trim().toLowerCase();
    setState({});
  });
}

export async function renderToolkitTree(container) {
  const toolkits = await api.listToolkits();
  if (!toolkits.length) {
    container.innerHTML = `
      <div class="tree-empty">
        <strong>还没有 Adapter</strong>
        <span>先创建 Adapter，再为它添加 Tool。</span>
      </div>`;
    return;
  }

  if (state.toolkitId) expandedToolkitIds.add(state.toolkitId);
  const groups = await Promise.all(toolkits.map(async (toolkit) => ({
    toolkit,
    tools: await api.listTools(toolkit.toolkit_id),
  })));
  const visibleGroups = groups.map(({ toolkit, tools }) => {
    if (!searchValue) return { toolkit, tools };
    const toolkitMatches = `${toolkit.name} ${toolkit.toolkit_id}`.toLowerCase().includes(searchValue);
    const matchingTools = tools.filter((tool) =>
      `${tool.name} ${tool.tool_id}`.toLowerCase().includes(searchValue));
    if (!toolkitMatches && !matchingTools.length) return null;
    return { toolkit, tools: toolkitMatches ? tools : matchingTools };
  }).filter(Boolean);

  if (!visibleGroups.length) {
    container.innerHTML = `<div class="tree-empty"><strong>没有匹配结果</strong><span>搜索只匹配 Adapter 和 Tool 的名称。</span></div>`;
    return;
  }

  container.innerHTML = `
    <div class="tree-head">Adapter 导航</div>
    <div class="tree-groups">
      ${visibleGroups.map(({ toolkit, tools }) => toolkitHtml(toolkit, tools)).join("")}
    </div>`;

  container.querySelectorAll("[data-toggle-toolkit]").forEach((button) => {
    button.addEventListener("click", () => {
      const toolkitId = button.dataset.toggleToolkit;
      if (expandedToolkitIds.has(toolkitId)) expandedToolkitIds.delete(toolkitId);
      else expandedToolkitIds.add(toolkitId);
      renderToolkitTree(container);
    });
  });
  container.querySelectorAll("[data-new-tool]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openCreateToolModal(button.dataset.newTool);
    });
  });
  container.querySelectorAll("[data-manage-toolkit]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await openManageToolkit(button.dataset.manageToolkit);
    });
  });
  container.querySelectorAll("[data-select-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      expandedToolkitIds.add(button.dataset.toolkitId);
      setState({
        toolkitId: button.dataset.toolkitId,
        toolId: button.dataset.selectTool,
        sourceExplorationId: null,
        restartFromExploration: false,
        debugRunEvidenceId: null,
      });
    });
  });
  container.querySelectorAll("[data-manage-tool]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await openManageTool(button.dataset.toolkitId, button.dataset.manageTool);
    });
  });
}

function toolkitHtml(toolkit, tools) {
  const toolkitId = toolkit.toolkit_id;
  const expanded = searchValue || expandedToolkitIds.has(toolkitId);
  return `
    <section class="tree-group">
      <div class="tree-toolkit-row ${toolkitId === state.toolkitId ? "current" : ""}">
        <button class="tree-toggle" type="button" data-toggle-toolkit="${esc(toolkitId)}" aria-expanded="${expanded}">
          <span class="tree-chevron" aria-hidden="true">${expanded ? "⌄" : "›"}</span>
          <span class="tree-toolkit-icon" aria-hidden="true">▣</span>
          <span class="tree-toolkit-name">${esc(toolkit.name)}</span>
          <span class="tree-domain-count">${(toolkit.allowed_domains || []).length} 个域名</span>
        </button>
        <div class="tree-row-actions">
          <button class="tree-icon-action" type="button" data-new-tool="${esc(toolkitId)}" title="新建 Tool" aria-label="在 ${esc(toolkit.name)} 中新建 Tool">+</button>
          <button class="tree-icon-action" type="button" data-manage-toolkit="${esc(toolkitId)}" title="管理 Adapter" aria-label="管理 ${esc(toolkit.name)}">•••</button>
        </div>
      </div>
      ${expanded ? `
        <div class="tree-tools">
          ${tools.length ? tools.map((tool) => toolHtml(toolkitId, tool)).join("") : `
            <button class="tree-inline-empty" type="button" data-new-tool="${esc(toolkitId)}">暂无 Tool，点击新建</button>`}
        </div>` : ""}
    </section>`;
}

function toolHtml(toolkitId, tool) {
  const active = toolkitId === state.toolkitId && tool.tool_id === state.toolId;
  return `
    <div class="tree-tool-row ${active ? "active" : ""}">
      <button class="tree-tool-select" type="button" data-toolkit-id="${esc(toolkitId)}" data-select-tool="${esc(tool.tool_id)}" ${active ? 'aria-current="page"' : ""}>
        <span aria-hidden="true">◇</span><span>${esc(tool.name)}</span>
      </button>
      <button class="tree-icon-action tree-tool-manage" type="button" data-toolkit-id="${esc(toolkitId)}" data-manage-tool="${esc(tool.tool_id)}" title="管理 Tool" aria-label="管理 ${esc(tool.name)}">•••</button>
    </div>`;
}

function openCreateToolkitModal() {
  openModal({
    title: "新建 Adapter",
    submitLabel: "创建",
    fields: [
      { name: "name", label: "Adapter 名称", placeholder: "如 blog_admin", required: true,
        hint: "小写字母、数字、下划线，且以字母开头，创建后不可修改，同时作为 Adapter 标识" },
      { name: "description", label: "描述", placeholder: "管理博客站点的后台操作工具集" },
      { name: "allowed_domains", label: "允许域名", placeholder: "blog.example.com, auth.example.com", required: true,
        hint: "多个域名用逗号分隔，不做隐式子域名泛匹配" },
    ],
    onSubmit: async (data) => {
      const created = await api.createToolkit(data);
      expandedToolkitIds.add(created.toolkit_id);
      toast(`已创建 Adapter「${created.name}」`);
      setState({ toolkitId: created.toolkit_id, toolId: null });
    },
  });
}

async function openManageToolkit(toolkitId) {
  const toolkit = await api.getToolkit(toolkitId);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>管理 Adapter · ${esc(toolkit.name)}</h3>
      <form class="modal-form" id="manageToolkitForm">
        <label class="field"><span class="field-label">Adapter ID</span><input value="${esc(toolkit.toolkit_id)}" disabled /></label>
        <label class="field"><span class="field-label">描述</span><textarea name="description" rows="3">${esc(toolkit.description || "")}</textarea></label>
        <label class="field"><span class="field-label">允许域名 *</span><textarea name="allowed_domains" rows="3">${esc((toolkit.allowed_domains || []).join("\n"))}</textarea><span class="field-hint">修改后不得排除已有 Tool 的起始 URL</span></label>
        <div class="modal-error" hidden></div>
        <div class="modal-actions"><button class="btn btn-ghost danger-text" type="button" data-delete>删除 Adapter</button><span class="grow"></span><button class="btn btn-ghost" type="button" data-close>取消</button><button class="btn btn-primary" type="submit">保存</button></div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const showError = (error) => {
    const box = overlay.querySelector(".modal-error");
    box.hidden = false;
    box.textContent = error.message;
  };
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-delete]").addEventListener("click", async () => {
    if (!window.confirm(`删除 Adapter「${toolkit.name}」？仅空 Adapter 可以删除。`)) return;
    try {
      await api.deleteToolkit(toolkitId);
      close();
      expandedToolkitIds.delete(toolkitId);
      toast("Adapter 已删除");
      await selectFallback();
    } catch (error) {
      showError(error);
    }
  });
  overlay.querySelector("#manageToolkitForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    values.allowed_domains = String(values.allowed_domains || "").split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
    try {
      await api.updateToolkit(toolkitId, values);
      close();
      toast("Adapter 已更新");
      setState({});
    } catch (error) {
      showError(error);
    }
  });
}

async function openCreateToolModal(toolkitId) {
  const toolkit = await api.getToolkit(toolkitId);
  openModal({
    title: `新建 Tool · ${toolkit.name}`,
    submitLabel: "创建",
    fields: [
      { name: "name", label: "Tool 名称", placeholder: "如 search_blog", required: true,
        hint: "小写字母、数字、下划线，且以字母开头，创建后不可修改，同时作为 Tool 标识" },
      { name: "goal", label: "功能描述", placeholder: "根据关键词搜索已有博客并返回匹配结果", required: true },
      { name: "start_url", label: "起始 URL", placeholder: "https://blog.example.com/admin/posts", required: true,
        hint: `需属于 Adapter 允许域名：${toolkit.allowed_domains.join("、")}` },
      { name: "expected_effect", label: "运行后达成的页面效果", placeholder: "页面显示搜索结果并返回结构化列表" },
    ],
    onSubmit: async (data) => {
      const created = await api.createTool(toolkitId, data);
      expandedToolkitIds.add(toolkitId);
      toast(`已创建 Tool「${created.name}」`);
      setState({ toolkitId, toolId: created.tool_id, sourceExplorationId: null, debugRunEvidenceId: null });
    },
  });
}

async function openManageTool(toolkitId, toolId) {
  const tool = await api.getTool(toolkitId, toolId);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>管理 Tool · ${esc(tool.name)}</h3>
      <form class="modal-form" id="manageToolForm">
        <label class="field"><span class="field-label">Tool ID</span><input value="${esc(tool.tool_id)}" disabled /></label>
        <label class="field"><span class="field-label">功能描述 *</span><textarea name="goal" rows="3">${esc(tool.goal)}</textarea></label>
        <label class="field"><span class="field-label">起始 URL *</span><input name="start_url" type="url" value="${esc(tool.start_url)}" /></label>
        <label class="field"><span class="field-label">运行后达成的页面效果</span><textarea name="expected_effect" rows="3">${esc(tool.expected_effect || "")}</textarea></label>
        <div class="modal-error" hidden></div>
        <div class="modal-actions"><button class="btn btn-ghost danger-text" type="button" data-delete>删除 Tool</button><span class="grow"></span><button class="btn btn-ghost" type="button" data-close>取消</button><button class="btn btn-primary" type="submit">保存</button></div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const showError = (error) => {
    const box = overlay.querySelector(".modal-error");
    box.hidden = false;
    box.textContent = error.message;
  };
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-delete]").addEventListener("click", async () => {
    if (!window.confirm(`删除 Tool「${tool.name}」？关联历史将不再展示。`)) return;
    try {
      await api.deleteTool(toolkitId, toolId);
      close();
      toast("Tool 已删除");
      const tools = await api.listTools(toolkitId);
      setState({
        toolkitId,
        toolId: tools[0]?.tool_id || null,
        sourceExplorationId: null,
        restartFromExploration: false,
        debugRunEvidenceId: null,
      });
    } catch (error) {
      showError(error);
    }
  });
  overlay.querySelector("#manageToolForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api.updateTool(toolkitId, toolId, Object.fromEntries(new FormData(event.currentTarget).entries()));
      close();
      toast("Tool 已更新");
      setState({});
    } catch (error) {
      showError(error);
    }
  });
}

async function selectFallback() {
  const toolkits = await api.listToolkits();
  const toolkitId = toolkits[0]?.toolkit_id || null;
  const tools = toolkitId ? await api.listTools(toolkitId) : [];
  setState({
    toolkitId,
    toolId: tools[0]?.tool_id || null,
    sourceExplorationId: null,
    restartFromExploration: false,
    debugRunEvidenceId: null,
  });
}
