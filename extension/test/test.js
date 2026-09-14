/**
 * 测试面板脚本
 * 通过 chrome.runtime.sendMessage 与 background service worker 通信，
 * 获取已注册工具列表并执行工具调用
 */

const tabSelect = document.getElementById("tab-select");
const toolSelect = document.getElementById("tool-select");
const argsInput = document.getElementById("args-input");
const callBtn = document.getElementById("call-btn");
const resultEl = document.getElementById("result");
const refreshTabsBtn = document.getElementById("refresh-tabs");

// ─── 获取工具注册表 ────────────────────────────────────────────────────────

async function loadRegistry() {
  tabSelect.innerHTML = '<option value="">加载中...</option>';
  toolSelect.innerHTML = '<option value="">请先选择 Tab</option>';
  callBtn.disabled = true;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "get_registry" });
  } catch (err) {
    tabSelect.innerHTML = '<option value="">通信失败，请检查扩展是否已加载</option>';
    showError("无法获取工具列表: " + err.message);
    return;
  }

  const tools = response?.tools ?? [];

  if (tools.length === 0) {
    tabSelect.innerHTML = '<option value="">没有发现已注册的工具（请先打开支持的网站）</option>';
    return;
  }

  // 按 tabId 分组
  const byTab = new Map();
  for (const tool of tools) {
    if (!byTab.has(tool.tabId)) byTab.set(tool.tabId, []);
    byTab.get(tool.tabId).push(tool);
  }

  // 填充 Tab 选择器
  tabSelect.innerHTML = "";
  for (const [tabId, tabTools] of byTab.entries()) {
    // 获取 Tab 标题
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const label = tab ? `Tab ${tabId}: ${tab.title?.slice(0, 50)}` : `Tab ${tabId}`;
    const opt = document.createElement("option");
    opt.value = tabId;
    opt.textContent = label;
    opt.dataset.tools = JSON.stringify(tabTools);
    tabSelect.appendChild(opt);
  }

  onTabChange();
}

// ─── Tab 切换时更新工具列表 ────────────────────────────────────────────────

function onTabChange() {
  const selected = tabSelect.options[tabSelect.selectedIndex];
  if (!selected?.value) {
    toolSelect.innerHTML = '<option value="">请先选择 Tab</option>';
    callBtn.disabled = true;
    return;
  }

  const tools = JSON.parse(selected.dataset.tools ?? "[]");
  toolSelect.innerHTML = "";

  for (const tool of tools) {
    const opt = document.createElement("option");
    opt.value = tool.name;
    opt.textContent = `${tool.name}`;
    opt.title = tool.description;
    opt.dataset.schema = JSON.stringify(tool.parameters ?? {});
    toolSelect.appendChild(opt);
  }

  onToolChange();
}

// ─── 工具切换时生成默认参数 ───────────────────────────────────────────────

function onToolChange() {
  const selected = toolSelect.options[toolSelect.selectedIndex];
  if (!selected) { callBtn.disabled = true; return; }

  callBtn.disabled = false;

  // 根据 JSON Schema 生成默认参数骨架
  const schema = JSON.parse(selected.dataset.schema ?? "{}");
  const defaultArgs = {};
  for (const [key, def] of Object.entries(schema.properties ?? {})) {
    if (def.type === "string") defaultArgs[key] = "";
    else if (def.type === "number") defaultArgs[key] = 0;
    else if (def.type === "boolean") defaultArgs[key] = false;
    else defaultArgs[key] = null;
  }
  argsInput.value = JSON.stringify(defaultArgs, null, 2);

  // 显示工具描述
  const tool = JSON.parse(tabSelect.options[tabSelect.selectedIndex]?.dataset.tools ?? "[]")
    .find(t => t.name === selected.value);
  if (tool) {
    resultEl.className = "";
    resultEl.textContent = `工具描述：${tool.description}\n\n参数 Schema：\n${JSON.stringify(tool.parameters, null, 2)}`;
  }
}

// ─── 调用工具 ─────────────────────────────────────────────────────────────

async function callTool() {
  const tabId = Number(tabSelect.value);
  const toolName = toolSelect.value;

  let args;
  try {
    args = JSON.parse(argsInput.value || "{}");
  } catch (err) {
    showError("参数 JSON 格式错误: " + err.message);
    return;
  }

  callBtn.disabled = true;
  callBtn.textContent = "执行中...";
  resultEl.className = "";
  resultEl.textContent = `正在调用 ${toolName}(${JSON.stringify(args)})...`;

  const start = Date.now();

  try {
    // 通过 background service worker 调用工具
    const response = await chrome.runtime.sendMessage({
      type: "test_call_tool",
      tabId,
      toolName,
      args,
    });

    const elapsed = Date.now() - start;

    if (response?.error) {
      showError(`错误: ${response.error}\n\n耗时: ${elapsed}ms`);
    } else {
      showOk(`${JSON.stringify(response?.result, null, 2)}\n\n耗时: ${elapsed}ms`);
    }
  } catch (err) {
    showError("调用失败: " + err.message);
  } finally {
    callBtn.disabled = false;
    callBtn.textContent = "调用工具";
  }
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────

function showOk(text) {
  resultEl.className = "ok";
  resultEl.textContent = text;
}

function showError(text) {
  resultEl.className = "err";
  resultEl.textContent = text;
}

// ─── 事件绑定 ──────────────────────────────────────────────────────────────

tabSelect.addEventListener("change", onTabChange);
toolSelect.addEventListener("change", onToolChange);
callBtn.addEventListener("click", callTool);
refreshTabsBtn.addEventListener("click", loadRegistry);

// 初始化
loadRegistry();
