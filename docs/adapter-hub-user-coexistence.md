# WebCLI：call 命令自动打开站点 + Adapter Hub 用户/内置共存

> 状态：已实现
> 分支：dev_rickhuang
> 提交：`9e905d0`
> 关联：`docs/opencli_exploration_handoff.md`

本文档记录两个同时落地的功能：**① call 命令执行前自动打开未打开站点** 与 **② adapter hub 用户/内置共存方案**。若只关注 adapter 共存，可直接阅读第 3 节起的内容。

---

## 0. call 命令自动打开站点（浏览器预检查）

### 0.1 背景

`webcli call <tool>` 执行时，`cmdCall()` 只做 `ensureBridgeRunning()`（保证 bridge 进程在跑），不检查浏览器/站点状态。若目标站点标签页未打开，扩展侧 `call_tool` 分支会报 `未找到域名 "X" 的标签页，且该工具无法后台执行`——对直接执行命令的用户不友好。

### 0.2 方案

在扩展 `service-worker.js` 的 `call_tool` 分支：当 `findTabByDomain` 找不到 tab 且工具非 direct 模式时，**自动打开站点首页并等待注入完成后再重试**。

### 0.3 实现

新增三个辅助函数：

- `getHomepageUrlForDomain(domain)`：从 `loadLocalAdapterManifests()` 中按 `match` 命中 domain，取 `manifest.homepage_url`；无则回退 `http://<domain>/`。
- `waitForToolRegistry(domain, timeoutMs)`：轮询 `toolRegistry.has(domain)`，等待 adapter 注入完成（最多 10s）。
- `autoOpenHomepageTab(domain)`：`chrome.tabs.create({ url: homepage })` 打开，等待注入后返回 tabId。

修改 `call_tool` 分支（原 `findTabByDomain` 返回 null 处）：先 `autoOpenHomepageTab` 再重试 `findTabByDomain`，仍失败才抛错（错误信息提示"已尝试自动打开站点"）。

### 0.4 行为

```
webcli call scheduling.example.com.search_rooms --date=...   # 站点未打开
  → 扩展自动打开 https://scheduling.example.com/#/
  → 等待注入完成
  → 路由到 tab 执行工具
```

- 仅对需要 page context 的工具生效；direct 模式（后台 API）工具天然跳过。
- 内置工具 `open_browser`/`capture_screenshot` 由 bridge 直接处理，不受影响。

---

## 1. 背景与问题

## 1. 背景与问题

WeWorker 的 adapter（站点适配器）默认打包在扩展的 `extension/adapters/<id>/` 目录下，通过 `index.json` 登记、`registry.json` 聚合元数据。用户可以通过 `webcli adapter install --url/--file/<id>` 自行安装新站点 adapter，但存在三个核心问题：

1. **打包目录只读**：打包后的桌面应用中 `resources/extension/adapters/` 是只读的，应用更新会直接覆盖用户手动安装的 adapter。
2. **发现机制不完整**：CLI 安装的 adapter 写进 `extension/adapters/<id>/` 但不更新 `index.json`，扩展侧启动扫描只能发现内置 adapter，用户 adapter 依赖文件探测 fallback 才能被注入。
3. **同名冲突**：用户安装与内置同名的 adapter 会直接覆盖/冲突，无隔离。

## 2. 目标

让用户新增 adapter 与内置 adapter 干净共存：

- 用户 adapter 安装到**用户可写目录**，应用更新不覆盖。
- 内置 adapter 完全不变，现有调用路径不受影响。
- 同名 adapter 通过**后缀共存**，互不覆盖。
- 扩展、CLI、后端三层都能发现用户 adapter。

## 3. 方案总览：双层目录（1、合并用户目录，统一用weworker。2、weworker客户端adapter相关提示放入adpater目录。3、用户上传同名adapter冲突问题）

```
内置（打包只读）:
    <extension>/adapters/<id>/
        含 index.json / registry.json / index.js / manifest.json / SKILL.md ...

用户（可写、持久）:合并
    ~/.weworker/adapters/<id>/          （WeWorker 桌面）
    或 ~/.webcli/adapters/<id>/          （纯 CLI 环境，自动回退）

同名冲突:
    ~/.weworker/adapters/<id>.user/     （与内置同名时自动加 .user 后缀）
```

由于 Chrome 扩展无法直接读取 `~/.weworker` 文件系统，用户 adapter 的文件读取统一经 **bridge（WebSocket，Node 进程）代理**，复用已有的 `wecli_backend_file_read` 能力。

## 4. 实现细节

### 4.1 `webcli/paths.js` — 用户 adapter 目录解析

新增 `resolveUserAdaptersDir()`：

```js
export function resolveUserAdaptersDir() {
  const home = homedir();
  const weworker = join(home, '.weworker', 'adapters');
  if (existsSync(weworker)) return weworker;
  const webcli = join(home, '.webcli', 'adapters');
  if (existsSync(webcli)) return webcli;
  return weworker; // 默认 WeWorker 布局
}
```

### 4.2 `webcli/adapter-cli.js` — 安装到用户目录 + 后缀共存

- `writeAdapter()` 目标目录从 `EXTENSION_ADAPTERS_DIR` 改为 `USER_ADAPTERS_DIR`。

- 新增 `resolveInstallId()`：与内置同名时自动加 `.user` 后缀：

  ```
  webcli adapter install --file ./my.js --name test.site
      → ~/.weworker/adapters/test.site/

  webcli adapter install --file ./x.js --name mail.qq.com   # 内置同名
      → ~/.weworker/adapters/mail.qq.com.user/              # 后缀共存
  ```

- `listAllAdapterDirs()` / `findAdapterDir()`：list/info/skill/knowledge 均扫描内置 + 用户双目录；remove 可识别两类来源，但只允许移除用户 adapter，内置 adapter 保持只读。

- `cmdList` 对用户 adapter 标记 `[user]`：

  ```
  Installed adapters:
    - mail.qq.com (QQ邮箱)
    - mail.qq.com.user [user] (mail.qq.com.user)
    - test.site [user] (test.site)
  ```

### 4.3 `webcli/bridge.js` — 用户 adapter 文件代理

新增两条扩展 → bridge 的消息：

| 消息                   | 返回                                               |
| -------------------- | ------------------------------------------------ |
| `list_user_adapters` | 扫描用户目录，返回 `[{ id, dir, hasManifest, hasIndex }]` |
| `read_user_adapter`  | 读取用户 adapter 目录内指定文件（带路径白名单，防 `..` 穿越）           |

`_handleReadUserAdapter` 校验：adapterId 必须匹配 `SAFE_ADAPTER_ID_RE`，relPath 不得含 `..`，解析后路径必须仍位于用户 adapter 目录内。

### 4.4 `extension/background/service-worker.js` — 双层发现与注入

新增经 bridge 访问用户目录的辅助函数：

- `loadUserAdapterIds()`：`list_user_adapters` → 用户 adapter id 列表。
- `readUserAdapterFile(adapterId, relPath)`：`read_user_adapter` → 文件内容。
- `isUserAdapterInstalled()` / `isAnyAdapterInstalled()` / `loadAdapterManifestAnywhere()`：内置 fetch + 用户 bridge 双路径探测/读取。

修改点：

| 函数                            | 改动                                                                     |
| ----------------------------- | ---------------------------------------------------------------------- |
| `loadInstalledAdapterIds()`   | 合并 storage + index.json + `loadUserAdapterIds()`                       |
| `initInstalledAdapterIds()`   | 写回 storage 前合并用户 id，避免启动覆盖丢失                                           |
| `loadLocalAdapterManifests()` | 追加读取用户 adapter 的 manifest.json                                         |
| `findAdapterIdByFileProbe()`  | 用 `isAnyAdapterInstalled()` 覆盖内置 + 用户                                  |
| `resolveAdapterForHostname()` | manifest 读取改用 `loadAdapterManifestAnywhere()`                          |
| `loadStaticToolRoutes()`      | 用户 adapter 的 `wecli.generated.json` 从 bridge 读（支持 direct 路由）           |
| `injectAdapters()`            | 内置用 `{files}`，用户 adapter 用 `injectUserAdapterWithCode()` 以 `{code}` 注入 |

`injectUserAdapterWithCode()`：先注入 support files，再注入 `index.js`，全部经 `readUserAdapterFile` 取内容后 `chrome.scripting.executeScript({ code })`。

### 4.5 `weworker/backend-ts/src/adapter-parser.ts` — 后端双层扫描

- 新增 `findUserAdaptersDir()`：`~/.weworker/adapters` 或 `~/.webcli/adapters`。
- `parseAdaptersFromDir()`：抽取单目录解析逻辑。
- `parseAllAdapters()`：先扫内置目录，再扫用户目录（用户优先覆盖同名）。

### 4.6 `webcli/skill-installer.js` — skill 安装支持用户 adapter

`getInstalledAdapters()` 改为扫描内置 + 用户双目录，去重后生成 `webcli-<adapterId>` skill。

## 5. 使用方式

```bash
# 安装（写用户目录）
webcli adapter install --file ./my-adapter.js --name my.site.com
webcli adapter install --url https://cdn.example.com/adapter.js --name company.oa
webcli adapter install my.site.com            # 从 Hub

# 查看（内置 + 用户）
webcli adapter list

# 与内置同名 → 自动 .user 后缀共存
webcli adapter install --file ./x.js --name mail.qq.com
# → ~/.weworker/adapters/mail.qq.com.user/

# 移除用户 adapter；内置 adapter 会被明确拒绝
webcli adapter remove test.site
webcli adapter remove mail.qq.com.user
```

安装后提示用户 `webcli adapter refresh` 或 reload 扩展即可生效。

## 6. 验证

- `webcli adapter list` 同时显示内置与 `[user]` adapter。
- 同名安装自动落到 `<id>.user/`，内置 `mail.qq.com` 与用户 `mail.qq.com.user` 共存。
- `webcli adapter remove` 只移除用户 adapter，不修改安装包内置 adapter。
- 导航到用户 adapter 站点，扩展注入成功、工具可调用。
- 后端 `parseAllAdapters()` 能发现用户 adapter。
- 单元测试：`webcli/__tests__/user-adapter-dirs.test.js`（`resolveUserAdaptersDir` 路径解析 + `.user` 后缀共存）。

## 7. 兼容性

- 内置 adapter 完全不变，现有调用路径不受影响。
- 用户 adapter 以 `.user` 后缀 id 存在，工具名形如 `mysite.com.user.tool`。
- bridge 未连接时，扩展侧 `loadUserAdapterIds()` 返回 `[]`、`readUserAdapterFile()` 返回 `null`，自动回退内置逻辑。
