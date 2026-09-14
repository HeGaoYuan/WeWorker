import * as api from "../api.js";
import { esc, statusBadge, toneBadge } from "../util.js";
import { renderRunEvents } from "./run_events.js";
import { isBusy, refreshActivity } from "./activity_status.js";
import { openLightbox } from "./lightbox.js";

// Extract parameter collection
export function collectParams(container, schema) {
  const props = schema?.properties || {};
  const out = {};
  for (const [key, def] of Object.entries(props)) {
    const el = container.querySelector(`[name="${CSS.escape(key)}"]`);
    if (!el) continue;
    if (def.type === "boolean") out[key] = el.checked;
    else if (def.type === "integer" || def.type === "number") out[key] = el.value === "" ? "" : Number(el.value);
    else out[key] = el.value;
  }
  return out;
}

// Generate parameter form HTML
export function renderParamForm(schema) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const rows = Object.entries(props).map(([key, def]) => {
    const label = `${key}${required.has(key) ? " *" : ""}`;
    let field;
    if (def.type === "boolean") {
      field = `<input type="checkbox" name="${esc(key)}" />`;
    } else if (def.type === "integer" || def.type === "number") {
      field = `<input type="number" name="${esc(key)}" value="${esc(def.default ?? "")}" placeholder="${esc(def.description || "")}" />`;
    } else {
      field = `<input type="text" name="${esc(key)}" value="${esc(def.default ?? "")}" placeholder="${esc(def.description || "")}" />`;
    }
    return `<label class="field">
      <span class="field-label">${esc(label)}</span>
      ${field}
      ${def.description ? `<span class="field-hint">${esc(def.description)}</span>` : ""}
    </label>`;
  });
  return rows.join("") || `<div class="muted small">该 Tool 无业务参数</div>`;
}

// Generate events for a run to feed into renderRunEvents
export function eventsFor(run) {
  if (!run) return [];
  const t = run.created_at.slice(-5);
  const events = [
    { t, kind: "info", text: "Toolkit Runtime 读取 runtime.json 并绑定页面" },
    { t, kind: "run", text: `执行 ${run.tool_id}(${JSON.stringify(run.parameters)})` },
  ];
  if (run.status === "running") {
    events.push({ t, kind: "info", text: "运行中…" });
  } else if (run.status === "succeeded") {
    events.push({ t, kind: "ok", text: `成功：${JSON.stringify(run.result)}` });
  } else {
    events.push({ t, kind: "err", text: `失败：${run.error}` });
  }
  return events;
}

export function renderHistorySelector(runs, selectedRunId) {
  if (!runs || !runs.length) {
    return `<div class="slot-empty">暂无试运行记录</div>`;
  }
  const options = runs.map((r) => {
    const time = esc(r.created_at.slice(-8));
    let icon = "⏳";
    let statusText = "运行中";
    if (r.status === "succeeded") {
      icon = "✅";
      statusText = "成功";
    } else if (r.status === "failed") {
      icon = "❌";
      statusText = "失败";
    }
    const label = `${icon} #${esc(r.debug_run_id)} (${time}) - ${statusText}`;
    return `<option value="${esc(r.debug_run_id)}" ${r.debug_run_id === selectedRunId ? "selected" : ""}>${label}</option>`;
  }).join("");

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">试运行历史记录</div>
    </div>
    <select id="debugRunHistorySelect" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border, #d1d5db); border-radius: 6px; background-color: var(--panel-2, #f9fafb); color: var(--text-main, #111827); font-family: var(--font-mono, monospace); font-size: 12px; outline: none; cursor: pointer;">
      ${options}
    </select>
  `;
}

export function renderRunDetail(r) {
  if (!r) return `<div class="muted small">未选择运行记录</div>`;
  return `
    <div class="run-detail" style="border:none; padding:0; background:transparent;">
      <div class="run-events-container" style="margin-top: 4px;"></div>
    </div>
  `;
}
