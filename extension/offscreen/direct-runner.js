const frames = new Map();
const pendingCalls = new Map();

function safeAdapterId(value) {
  const text = String(value || "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text)) {
    throw new Error(`Invalid adapter id: ${text}`);
  }
  return text;
}

function structuredError(err) {
  return {
    code: err?.code || "DIRECT_RUNNER_ERROR",
    message: err?.message || String(err),
    ...(err?.details ? { details: err.details } : {}),
  };
}

function ensureFrame(route) {
  const adapterId = safeAdapterId(route?.adapterId);
  const existing = frames.get(adapterId);
  if (existing) return existing.ready.then(() => existing);

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out loading adapter ${adapterId}`)), 15000);
    pendingCalls.set(`ready:${adapterId}`, {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
  const frame = { iframe, ready };
  frames.set(adapterId, frame);
  iframe.src = chrome.runtime.getURL(`offscreen/direct-frame.html?adapterId=${encodeURIComponent(adapterId)}&webcli_direct_frame=${Date.now()}`);
  document.body.appendChild(iframe);
  return ready.then(() => frame);
}

window.addEventListener("message", (event) => {
  if (event.source === window || event.origin !== chrome.runtime.getURL("").slice(0, -1)) return;
  const msg = event.data || {};
  if (msg.type === "wecli_direct_frame_ready") {
    const pending = pendingCalls.get(`ready:${msg.adapterId}`);
    if (pending) {
      pendingCalls.delete(`ready:${msg.adapterId}`);
      pending.resolve();
    }
    return;
  }
  if (msg.type === "wecli_direct_frame_load_error") {
    const pending = pendingCalls.get(`ready:${msg.adapterId}`);
    if (pending) {
      pendingCalls.delete(`ready:${msg.adapterId}`);
      pending.reject(new Error(msg.error || `Failed to load adapter ${msg.adapterId}`));
    }
    return;
  }
  if (msg.type !== "wecli_direct_frame_call_result") return;
  const pending = pendingCalls.get(msg.id);
  if (!pending) return;
  pendingCalls.delete(msg.id);
  if (msg.ok) {
    pending.resolve(msg.result);
  } else {
    const err = new Error(msg.error?.message || msg.error || "Adapter execution failed");
    if (msg.error?.code) err.code = msg.error.code;
    if (msg.error?.details) err.details = msg.error.details;
    pending.reject(err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "wecli_offscreen_call_tool") return;

  (async () => {
    const frame = await ensureFrame(msg.route);
    const callId = msg.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCalls.delete(callId);
        reject(new Error(`Timed out executing ${msg.handlerName}`));
      }, 120000);
      pendingCalls.set(callId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
      frame.iframe.contentWindow.postMessage({
        type: "wecli_direct_frame_call_tool",
        id: callId,
        route: msg.route,
        handlerName: msg.handlerName,
        args: msg.args || {},
        traceID: msg.traceID || null,
      }, chrome.runtime.getURL("").slice(0, -1));
    });
    sendResponse({ ok: true, result });
  })().catch((err) => {
    sendResponse({ ok: false, error: structuredError(err) });
  });

  return true;
});
