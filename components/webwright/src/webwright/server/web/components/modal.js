// 轻量表单弹窗：Toolkit/Tool 创建等场景复用，不引入组件框架。
// 复用 .field/.field-label/.field-hint 样式，与调试参数表单保持一致外观。

import { esc } from "../util.js";

export function openModal({ title, fields, submitLabel = "创建", onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>${esc(title)}</h3>
      <form class="modal-form" novalidate>
        ${fields.map(fieldHtml).join("")}
        <div class="modal-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-cancel>取消</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("[data-cancel]").addEventListener("click", close);

  const form = overlay.querySelector(".modal-form");
  const errorBox = overlay.querySelector(".modal-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    errorBox.hidden = true;
    submitBtn.disabled = true;
    try {
      await onSubmit(data);
      close();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message || String(err);
      submitBtn.disabled = false;
    }
  });
  overlay.querySelector("input")?.focus();
  return close;
}

function fieldHtml(f) {
  return `<label class="field">
    <span class="field-label">${esc(f.label)}${f.required ? " *" : ""}</span>
    <input type="text" name="${esc(f.name)}" placeholder="${esc(f.placeholder || "")}" />
    ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ""}
  </label>`;
}
