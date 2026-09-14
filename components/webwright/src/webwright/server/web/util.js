// 通用工具：转义、徽章、状态文案、toast 提示。

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 运行状态 → 中文文案 + 色调类名。
const RUN_STATUS = {
  running: ["运行中", "warn"],
  waiting_for_user: ["等待接管", "warn"],
  queued: ["排队中", "muted"],
  succeeded: ["成功", "success"],
  failed: ["失败", "danger"],
  cancelled: ["已取消", "muted"],
};

export function statusBadge(status) {
  const [label, tone] = RUN_STATUS[status] || [status, "muted"];
  return `<span class="badge badge-${tone}">${esc(label)}</span>`;
}

export function toneBadge(text, tone) {
  return `<span class="badge badge-${tone}">${esc(text)}</span>`;
}

let toastTimer = null;
export function toast(msg) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 2200);
}
