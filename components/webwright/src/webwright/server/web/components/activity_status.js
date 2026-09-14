import * as api from "../api.js";
import { state, setState } from "../state.js";
import { esc } from "../util.js";

const LABELS = {
  exploration: "探索运行中",
  exploration_replay: "回放运行中",
  development: "开发运行中",
  debug: "Adapter 验证运行中",
  task: "任务运行中",
};

export function isBusy() {
  return Boolean(state.activity?.running);
}

export async function refreshActivity() {
  const activity = await api.getActivity();
  state.activity = activity;
  renderActivityStatus();
  return activity;
}

export function renderActivityStatus() {
  const button = document.getElementById("activityStatus");
  const activity = state.activity || {};
  button.hidden = !activity.running;
  if (!activity.running) return;
  const subject = activity.tool_id || activity.id;
  const label = `${LABELS[activity.kind] || "运行中"} · ${subject}`;
  button.title = activity.id && activity.id !== subject ? `${label}\n运行 ID：${activity.id}` : label;
  button.innerHTML = `<span class="dot dot-busy"></span><span class="status-label">${esc(label)}</span>`;
}

export function bindActivityStatus() {
  document.getElementById("activityStatus").addEventListener("click", () => {
    const activity = state.activity || {};
    const workspace = activity.kind === "debug" ? "debug" : activity.kind === "development" ? "develop" : "explore";
    setState({
      toolkitId: activity.toolkit_id || state.toolkitId,
      toolId: activity.tool_id || state.toolId,
      workspace,
    });
  });
}
