// 极简全局状态 + 订阅：不引入框架，state 变化后通知订阅者重渲染。

const listeners = new Set();

export const state = {
  toolkitId: null,
  toolId: null,
  workspace: "explore", // explore | develop | debug
  sourceExplorationId: null,
  restartFromExploration: false,
  debugRunEvidenceId: null,
  activity: { running: false, kind: "", id: "", toolkit_id: "", tool_id: "" },
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
