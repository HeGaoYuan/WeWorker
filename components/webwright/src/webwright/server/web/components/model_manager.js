import * as api from "../api.js";
import { esc, toast } from "../util.js";

let editingId = null;
let formMode = null;
let providers = [];

export async function refreshModelStatus() {
  const model = await api.getActiveModel();
  const button = document.getElementById("modelStatus");
  const label = `${model.provider} · ${model.model_name}`;
  button.title = label;
  button.innerHTML = `<span class="status-label">${esc(label)}</span>`;
  return model;
}

export function bindModelManager() {
  document.getElementById("modelStatus").addEventListener("click", openModelManager);
}

async function openModelManager() {
  editingId = null;
  formMode = null;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.dataset.modal = "model-manager";
  overlay.innerHTML = `<div class="modal model-modal"><h3>模型设置</h3><div id="modelManagerBody">加载中…</div></div>`;
  document.body.appendChild(overlay);
  await renderManager(overlay);
}

async function renderManager(overlay) {
  const payload = await api.getModels();
  providers = payload.providers || [];
  const body = overlay.querySelector("#modelManagerBody");
  const showForm = formMode !== null;
  body.innerHTML = `
    <div class="model-list-head">
      <h4>已配置模型</h4>
      <button class="btn btn-primary btn-sm" type="button" id="newModel">+ 新建模型</button>
    </div>
    <div class="model-list">
      ${(payload.models || []).length ? payload.models.map((model) => modelRow(model, payload.active_id)).join("") : `<div class="slot-empty">还没有模型配置</div>`}
    </div>
    ${showForm ? `
    <form id="modelForm" class="modal-form">
      <h4>${editingId ? "编辑模型" : "新建模型"}</h4>
      <label class="field"><span class="field-label">名称</span><input name="label" type="text" /></label>
      <label class="field"><span class="field-label">服务商 *</span><select name="provider">${providers.map((provider) => `<option value="${esc(provider.id)}">${esc(provider.label)}</option>`).join("")}</select></label>
      <label class="field"><span class="field-label">模型名</span><input name="model_name" type="text" /></label>
      <label class="field"><span class="field-label">baseUrl</span><input name="base_url" type="text" /></label>
      <label class="field"><span class="field-label">API Key</span><span class="password-field"><input name="api_key" type="password" autocomplete="off" /><button class="btn btn-ghost btn-sm" type="button" data-toggle-key>显示</button></span></label>
      <div class="modal-error" hidden></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-reset>取消</button>
        <button class="btn btn-primary" type="submit">保存</button>
      </div>
    </form>` : `<div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>关闭</button></div>`}`;

  bindManagerActions(overlay);
  if (formMode === "edit") await fillEditingModel(overlay, editingId);
  else if (formMode === "create") applyProviderDefaults(overlay);
}

function modelRow(model, activeId) {
  const active = model.id === activeId;
  return `<div class="model-row ${active ? "active" : ""}">
    <div class="model-main"><strong>${esc(model.label || model.model_name || model.id)}</strong><span class="muted small">${esc(model.provider)} · ${esc(model.model_name || "默认模型")}${model.has_key ? "" : " · 未填 key"}</span></div>
    <div class="model-actions">
      <button class="btn btn-sm ${active ? "btn-ghost" : "btn-primary"}" data-model-action="activate" data-model-id="${esc(model.id)}" ${active ? "disabled" : ""}>${active ? "已激活" : "激活"}</button>
      <button class="btn btn-ghost btn-sm" data-model-action="edit" data-model-id="${esc(model.id)}">编辑</button>
      <button class="btn btn-ghost btn-sm danger-text" data-model-action="delete" data-model-id="${esc(model.id)}">删除</button>
    </div>
  </div>`;
}

function bindManagerActions(overlay) {
  overlay.querySelector("[data-close]")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#newModel")?.addEventListener("click", async () => {
    editingId = null;
    formMode = "create";
    await renderManager(overlay);
  });
  overlay.querySelector("[data-reset]")?.addEventListener("click", async () => {
    editingId = null;
    formMode = null;
    await renderManager(overlay);
  });
  overlay.querySelector("[data-toggle-key]")?.addEventListener("click", (event) => {
    const input = overlay.querySelector('[name="api_key"]');
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.textContent = input.type === "password" ? "显示" : "隐藏";
  });
  overlay.querySelector('[name="provider"]')?.addEventListener("change", () => applyProviderDefaults(overlay));
  overlay.querySelectorAll("[data-model-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.modelAction;
      const modelId = button.dataset.modelId;
      if (action === "edit") {
        editingId = modelId;
        formMode = "edit";
      } else if (action === "activate") {
        await api.activateModel(modelId);
        await refreshModelStatus();
        toast("模型已激活");
      } else if (action === "delete") {
        if (!window.confirm("删除该模型配置？")) return;
        await api.deleteModel(modelId);
        if (editingId === modelId) editingId = null;
        await refreshModelStatus();
        toast("模型已删除");
      }
      await renderManager(overlay);
    });
  });
  overlay.querySelector("#modelForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const body = {
      label: values.label.trim(),
      provider: values.provider,
      model_name: values.model_name.trim(),
      base_url: values.base_url.trim(),
    };
    if (values.api_key || !editingId) body.api_key = values.api_key;
    const errorBox = form.querySelector(".modal-error");
    try {
      if (editingId) await api.updateModel(editingId, body);
      else await api.createModel(body);
      editingId = null;
      formMode = null;
      await refreshModelStatus();
      await renderManager(overlay);
      toast("模型配置已保存");
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
  });
}

async function fillEditingModel(overlay, modelId) {
  const model = await api.getModel(modelId);
  for (const name of ["label", "provider", "model_name", "base_url", "api_key"]) {
    const input = overlay.querySelector(`[name="${name}"]`);
    if (input) input.value = model[name] || "";
  }
}

function applyProviderDefaults(overlay) {
  const providerId = overlay.querySelector('[name="provider"]')?.value;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) return;
  overlay.querySelector('[name="model_name"]').placeholder = provider.default_model_name || "";
  overlay.querySelector('[name="base_url"]').placeholder = provider.default_endpoint || "";
}
