// 运行事件流组件：渲染传入的事件；demo 由调试视图基于最近一次运行生成。

import { esc } from "../util.js";

export function renderRunEvents(container, events = []) {
  if (!events.length) {
    container.innerHTML = `<div class="muted small">尚无运行事件</div>`;
    return;
  }
  container.innerHTML = `
    <div class="events">
      ${events.map(renderEvent).join("")}
    </div>`;
}

function renderEvent(e) {
  if (e.body) {
    return `
      <details class="event event-${e.kind} event-collapsible"${e.collapsed ? "" : " open"}>
        <summary>
          <span class="event-time">${esc(e.t)}</span>
          <span class="event-text">${esc(e.text)}</span>
        </summary>
        <pre class="event-body">${esc(e.body)}</pre>
      </details>`;
  }
  return `
    <div class="event event-${e.kind}">
      <span class="event-time">${esc(e.t)}</span>
      <span class="event-text">${esc(e.text)}</span>
    </div>`;
}
