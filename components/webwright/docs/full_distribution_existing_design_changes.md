# Webwright 完整分发存量设计改造方案

## 文档状态

- 当前版本：`1.2`
- 更新时间：2026-08-06
- 状态：历史方案；Webwright 已收口为 WeWorker 内部组件，独立 `installer/` 与单文件 `webcli-py` 分发已废弃。本文其余独立分发描述只保留决策背景，不再构成当前产品合同
- 适用范围：Python harness 的 `local_browser + local_cdp` 模式
- 关联设计：[`local_cdp_http_server_design.md`](local_cdp_http_server_design.md)、[`toolkit_technical_design.md`](toolkit_technical_design.md)
- 关联 Roadmap：[`../ROADMAP.md`](../ROADMAP.md)

## 一、背景

历史 `installer/` 子项目曾负责把 `webcli-py` 打包为独立 Python／Playwright Runtime，使外部分发的四文件 Skill 可以通过以下形式运行：

```text
webcli-py scripts/toolkit.py <tool>
```

它不导入完整 `webwright` 包，也不包含 Server、模型后端、三工作区 UI、Exploration、Development Run、Debug Run 或 Publisher。这一边界已经明确，不应为了完整产品分发而扩张 `webcli-py`。

完整 Webwright harness 目前仍依赖源码工程：

```text
clone repository
→ 安装 uv
→ 创建／同步 Python 环境
→ 从仓库目录执行 uv run webwright-server
```

这意味着最终用户需要理解仓库、Python、uv、依赖和工作目录。项目虽然已有可用的本地 Server 和 UI，但还不是一个可独立安装、启动和卸载的产品。

同时，现有实现隐含依赖源码运行环境：

1. `sys.executable` 被视为通用 Python 解释器，用于启动 Exploration、Replay、Development、Debug 和正式 Toolkit CLI。
2. Server、TaskStore 和 ToolkitStore 默认将相对 `outputs/server/` 作为数据根目录。
3. 子进程继承 Server 当前工作目录。
4. 内置 YAML、Web UI 和 canonical `toolkit_runtime.py` 默认可通过源码文件路径读取。
5. 系统 Chrome／Edge 默认继承普通 Python 进程环境，而冻结程序会修改动态库搜索环境。

这些假设在源码模式下成立，但打包后不再成立。完整分发不能只增加一个 PyInstaller 构建脚本；必须先修改运行时、路径和资源合同。

项目尚未正式发布，现有 `outputs/` 将由用户清理。本方案不设计旧数据迁移、旧 Profile 兼容、旧环境变量别名或历史目录自动探测，直接以最终合同为目标。

## 二、目标与非目标

### 2.1 目标

1. 用户不需要 clone 仓库、安装 Python、安装 uv 或同步项目依赖。
2. 完整 Webwright 可以从平台安装目录启动本地 Server 和三工作区 UI。
3. 源码模式与安装模式共享同一业务实现、数据目录合同和验证标准。
4. Exploration、Replay、Development、Debug 和 Publisher 在冻结程序中继续使用隔离子进程。
5. `local_browser + local_cdp` 继续使用系统 Chrome／Edge，不随完整安装包安装浏览器。
6. 程序升级只替换程序本体，不改写用户任务、Toolkit、模型配置或浏览器 Profile。
7. 历史方案要求已发布 Toolkit 由独立 `webcli-py` 执行；当前改为 WeWorker 随包 wrapper 统一复用 embedded runtime。

### 2.2 非目标

- 不修改 Toolkit／Tool 产品模型。
- 不修改 Exploration → Development → Debug → Publish 流程。
- 不修改正式 Skill 四文件合同。
- 不建设数据库、云端服务、多用户或自动更新服务。
- 不处理 Browserbase、`local_launch` 或 `local_persistent`。
- 不迁移或识别旧 `outputs/`、旧 `edge-profile` 或旧配置目录。
- 本阶段不确定商店发布、签名、公证、自动升级和 UI 图标细节；这些属于后续完整分发设计。

## 三、核心决策

### 3.1 InstallRoot 与 WebwrightHome 分离

程序本体和用户数据必须分离：

```text
InstallRoot
→ 安装器管理的只读程序与依赖

WebwrightHome
→ Webwright 管理的可写用户数据
```

InstallRoot 推荐位置：

- macOS：`~/Applications/Webwright.app`
- Windows：`%LOCALAPPDATA%\Programs\Webwright`

当前完整分发只要求 macOS 和 Windows；Linux 安装位置留待未来单独设计。

InstallRoot 逻辑结构：

```text
InstallRoot/
├── webwright
├── _internal/
│   ├── embedded Python
│   ├── Python dependencies
│   ├── Playwright driver
│   ├── Webwright package
│   ├── builtin YAML
│   └── Web UI assets
└── uninstall metadata
```

WebwrightHome 固定默认为：

```text
~/.weworker/webwright
```

Windows 中 `~` 解析为 `%USERPROFILE%`。允许通过唯一公开覆盖项指定其他目录：

```text
WEBWRIGHT_HOME=/absolute/path
```

WebwrightHome 逻辑结构：

```text
~/.weworker/webwright/
├── .env
├── models.json
├── tasks/
├── toolkits/
│   └── <toolkit_id>/
├── browser/
│   └── profile/
├── toolkit-state/
└── logs/
```

目录语义：

- `.env`：CLI 或环境变量式模型配置入口。
- `models.json`：Server UI 管理的模型配置和 API Key。
- `tasks/`：Exploration、Replay、步骤、截图和 trajectory。
- `toolkits/`：Toolkit、Tool、双槽位、Development Run、Debug Run、正式四文件 Skill 和工程内 Runtime Store。
- `browser/profile/`：Webwright Agent Browser 的持久 Profile，不绑定 Edge 或 Chrome 品牌名。
- `toolkit-state/`：外部分发 Toolkit 的可恢复页面状态。
- `logs/`：不属于某个 Task／Run 的应用级日志。

卸载默认只删除 InstallRoot，不删除 WebwrightHome。未来如提供“同时清除用户数据”，必须作为独立、明确的破坏性选项。

写入与权限边界：

- InstallRoot 在运行期间只读，Server、Worker 和 Publisher 不得向其中写入状态或生成物。
- WebwrightHome 是唯一默认持久写入根目录。
- POSIX 平台创建 WebwrightHome 时使用仅当前用户可访问的目录权限；`.env` 和 `models.json` 使用仅当前用户可读写的文件权限。
- Windows 安装与运行均使用当前用户目录，不向系统级公共目录写入模型 Key。
- API Key 不进入 Task Spec、Toolkit、日志、正式 Skill 或安装包。

### 3.2 完整产品使用 `onedir`

完整 Webwright 采用 PyInstaller `onedir`，macOS 在 `.app` 内保留目录结构，Windows 由图形化安装器安装完整目录。

macOS 的 `.app` 是构建中间产物，面向用户的最终交付物为按架构命名的压缩 DMG：

```text
Webwright-macos-arm64.dmg
```

DMG 内包含 `Webwright.app`。当前阶段允许不做 Developer ID 签名和 Apple 公证；这不影响 DMG 生成，但最终用户首次运行时仍可能遇到 Gatekeeper 提示。

Windows 的 `onedir` 同样是构建中间产物，构建脚本必须自动调用 Inno Setup，面向用户的最终交付物固定为：

```text
Webwright-windows-x64-Setup.exe
```

Windows 构建机需要预先安装 Inno Setup 6；最终用户只接收安装程序，不直接接收 `onedir` 目录或单独的 `Webwright.exe`。

不使用完整产品 `onefile`，原因是：

- Server 是长生命周期进程。
- 每次 Exploration、Replay、Development 和 Debug 都会启动 Worker。
- `onefile` 会引入临时解压和多进程复用的额外生命周期复杂度。
- `onedir` 更适合签名、升级、诊断和稳定访问包内资源。

该独立 `webcli-py` 单文件合同已于 2026-08-06 废弃；当前只保留 WeWorker 随包轻量 wrapper 与 embedded runtime。

### 3.3 完整分发使用独立子项目

历史方案曾让 `installer/` 单独维护 `webcli-py`，并为完整 Webwright 分发新增独立目录：

```text
distribution/
├── AGENTS.md
├── pyproject.toml
├── scripts/
├── macos/
├── windows/
└── tests/
```

进入实现阶段时，必须先创建 `distribution/AGENTS.md`，再添加构建代码和平台安装器资源。

### 3.4 构建环境固定

完整分发不能直接依赖根 `pyproject.toml` 的宽松版本范围。`distribution/` 必须用独立 `pyproject.toml` 和 `uv.lock` 固定构建环境，首个实现基线为：

```text
CPython 3.14.6
Playwright 1.60.0
PyInstaller 6.21.0
```

其余完整 Webwright 运行依赖也必须由锁文件固定。根项目仍可保留源码开发所需的 `requires-python >= 3.10`，分发构建版本不反向收窄源码包支持范围。

macOS 与 Windows 必须在对应平台分别构建。一个平台的锁文件一致性不能代替另一个平台的真实构建和运行验证。

## 四、统一路径合同

新增单一事实源 `WebwrightPaths`：

```python
@dataclass(frozen=True)
class WebwrightPaths:
    home: Path
    env_file: Path
    models_file: Path
    tasks: Path
    toolkits: Path
    browser_profile: Path
    toolkit_state: Path
    logs: Path
```

解析规则：

```text
WEBWRIGHT_HOME 已设置
→ 使用显式绝对路径

否则
→ Path.home() / ".webwright"
```

应用启动流程统一为：

```text
入口解析 WebwrightPaths
→ 创建必要目录
→ 显式构造各 Store
→ 构造 RuntimeLauncher
→ create_app(...)
```

约束：

1. 源码模式和安装模式使用完全相同的默认路径。
2. 不通过 `sys.frozen` 决定用户数据位置。
3. `create_app()` 不再从 `output_root` 推导 models 和 toolkits。
4. `TaskStore`、`ToolkitStore` 不再提供相对 `outputs/server/` 默认值。
5. 每个 Worker Spec 中的路径必须是绝对路径。
6. 每个子进程必须显式指定与当前 Run 对应的 `cwd`，不得使用 Server 的 `Path.cwd()`。
7. 自动化测试必须注入临时 WebwrightHome，不得写入真实 `~/.weworker/webwright`。
8. 删除 `MSWEBA_GLOBAL_CONFIG_DIR`；统一使用 `WEBWRIGHT_HOME`。
9. 如果 `platformdirs` 在改造后不再有其他用途，则从根项目依赖中删除。

公开运行配置统一为：

```text
WEBWRIGHT_HOME
WEBWRIGHT_BROWSER_EXECUTABLE
WEBWRIGHT_BROWSER_PROFILE
WEBWRIGHT_CDP_URL
WEBWRIGHT_STATE_DIR
```

`WEBWRIGHT_RUNTIME_PATH`、`WEBWRIGHT_SCREENSHOT_PATH` 等只服务工程内 formal Debug，不作为普通用户配置入口。旧的 `LOCAL_BROWSER_*`、`BROWSER_*` 同义变量不保留别名。

## 五、RuntimeLauncher 合同

### 5.1 问题

普通 Python 进程中，`sys.executable` 是 Python 解释器；冻结应用中，它是 Webwright 可执行文件。现有以下调用不能直接进入安装版：

- `webwright.run.local_cdp_task`
- `webwright.run.local_cdp_replay`
- `webwright.run.tool_development`
- `webwright.run.tool_debug`
- formal Debug 执行正式 `scripts/toolkit.py`
- Publisher 验证生成的 `scripts/toolkit.py`

### 5.2 设计

新增 `RuntimeLauncher`，业务模块只请求逻辑命令，不判断源码／冻结模式：

```text
RuntimeLauncher
├── worker_command(worker_kind, spec_path)
├── script_command(script_path, arguments)
├── internal_worker_environment(extra)
└── external_process_environment(extra)
```

固定 Worker 白名单：

```text
local-cdp-task
local-cdp-replay
tool-development
tool-debug
```

源码模式命令：

```text
<python> -m webwright.run.local_cdp_task --spec <path>
<python> <toolkit.py> --help
```

安装模式命令：

```text
<webwright> --internal-worker local-cdp-task --spec <path>
<webwright> --internal-script <toolkit.py> --help
```

`--internal-worker` 和 `--internal-script` 是内部运行入口，不进入普通用户帮助和产品 API。应用 Bootstrap 必须在导入可能使用多进程的第三方模块前调用 `multiprocessing.freeze_support()`。

### 5.3 约束

- `ProcessManager`、`tool_debug.py` 和 `publisher.py` 不得直接拼接 `sys.executable`。
- Worker 模块保留现有 `main(argv)` 和 Spec 合同，源码模式与冻结模式进入同一业务函数。
- 内部 Worker 继承冻结 Runtime 环境，不能使用外部进程清理后的环境。
- formal Debug 仍执行已发布的四文件 Skill 本体，不回退到 Store Tool Runner。
- Publisher 仍用真实 CLI `--help` 验证生成物，不将验证降级为只做 `compile()`。
- 导出后的 Toolkit 继续由 `webcli-py` 执行，不要求目标机器安装完整 Webwright。

## 六、包内资源合同

完整包必须显式收集：

- `webwright/config/*.yaml`
- `webwright/server/web/*`
- Playwright Python 包与 driver
- 动态导入的 Model、Environment 和 Agent 实现
- canonical `toolkit_runtime.py` 的可读源码内容

新增 `BundledResources`：

```text
BundledResources
├── builtin_config(name)
├── web_asset(name)
└── canonical_toolkit_runtime()
```

内置 YAML 和 Web UI 只从 InstallRoot 读取，不复制到 WebwrightHome。

Publisher 当前通过 `toolkit_runtime.__file__` 读取 canonical Runtime。冻结包不能假定被导入模块的源码文件可直接读取，因此构建时必须从唯一源码额外收集一份只读资源，Publisher 通过 `BundledResources` 读取。仓库中不得人工维护第二份 canonical Runtime。

正式 Skill 继续只有四个文件：

```text
<skill-name>/
├── SKILL.md
└── scripts/
    ├── toolkit.py
    ├── toolkit_runtime.py
    └── requirements.txt
```

## 七、系统浏览器进程环境

冻结应用会修改自己的动态库搜索环境。内部 Worker 和包内 helper 需要该环境，但系统 Chrome／Edge 不应继承可能冲突的打包器搜索路径。

必须区分：

```text
内部 Worker／包内 Playwright driver
→ 保留冻结 Runtime 环境

系统 Chrome／Edge
→ 使用清理后的 external_process_environment
```

修改范围：

- `webwright.utils.local_cdp` 的 Agent Browser 启动。
- canonical `toolkit_runtime.py` 的浏览器自动恢复启动。
- Windows DLL 搜索路径和 PATH 清理。
- macOS Finder 精简 PATH 下的绝对浏览器可执行文件发现。

浏览器启动仍遵守现有产品合同：只自动启动本机 CDP，远程 CDP 不自动启动本地浏览器；只在业务函数执行前恢复连接，不在业务副作用开始后自动重试 Tool。

## 八、存量设计文档修改范围

### 8.1 `local_cdp_http_server_design.md`

必须修改：

- 架构图中的 `python -m` 改为逻辑 Worker。
- 启动入口区分源码命令与安装版入口。
- `outputs/server/tasks` 改为 `~/.weworker/webwright/tasks`。
- 增加 InstallRoot／WebwrightHome 边界。
- 子进程章节增加 RuntimeLauncher、显式 `cwd` 和环境分类。
- 示例 Spec 使用 WebwrightHome 下绝对路径。
- 手工验证增加冻结模式。

### 8.2 `toolkit_technical_design.md`

必须修改：

- §3：现有架构基线补充源码运行假设。
- §6：文件存储根目录改为 `~/.weworker/webwright`。
- §7：区分工程内 Runtime Store 与外部分发 `toolkit-state/`。
- §9：Debug Run 通过 RuntimeLauncher 执行。
- §10：Publisher 通过内部脚本入口验证四文件正式 CLI。
- §13：ProcessManager 注入 RuntimeLauncher。
- §15：增加 InstallRoot／WebwrightHome 写入边界和外部进程环境。
- §16：补充完整分发可行性。
- §17：补充路径、资源、Worker 和浏览器启动影响面。
- §18：增加源码／冻结双模式合同测试。
- §19：增加完整分发实施顺序。

### 8.3 不修改

- `toolkit_product_design.md`。
- Toolkit／Tool、Exploration、Development Run、Debug Run 领域模型。
- 正式／开发中双槽位和发布资格。
- formal Debug 与 `artifact_hash` 语义。
- 三工作区 UI、HTTP API 和模型请求协议。
- Skill 四文件合同和 `webcli-py` 外部调用形式。

## 九、代码影响面

| 模块 | 影响级别 | 变化 |
|---|---:|---|
| `server/process_manager.py` | 高 | 所有 Worker 命令改由 RuntimeLauncher 生成，显式 `cwd` |
| `run/tool_debug.py` | 高 | formal CLI 改用内部脚本运行入口 |
| `server/publisher.py` | 高 | CLI 验证和 canonical Runtime 资源读取改造 |
| `run/server.py` | 中 | WebwrightPaths 和应用 Bootstrap |
| `server/app.py` | 中 | 删除从 `output_root` 隐式推导其他 Store |
| `server/records.py` | 中 | 删除相对 TaskStore 默认根目录 |
| `server/toolkit_store.py` | 中 | 删除相对 ToolkitStore 默认根目录 |
| `webwright/__init__.py` | 中 | 配置路径改为 WebwrightHome，删除旧环境变量和 import 写目录副作用 |
| `utils/local_cdp.py` | 中 | Profile 路径、公开环境变量和外部进程环境 |
| `tool_runtime/toolkit_runtime.py` | 中 | Profile／State 路径和外部浏览器环境 |
| `config/__init__.py` | 低至中 | 通过 BundledResources 读取内置 YAML |
| `server/web/`、API、模型协议 | 无或低 | 业务合同不变，仅验证包内交付 |

建议新增：

```text
src/webwright/
├── paths.py
├── resources.py
└── runtime_launcher.py
```

## 十、可行性与风险

| 项目 | 可行性 | 风险 | 判断 |
|---|---:|---:|---|
| `~/.weworker/webwright` 统一数据根目录 | 高 | 低 | 纯路径和依赖注入改造，无迁移负担 |
| 内部 Worker 分发 | 高 | 中 | 需要统一入口并防止冻结程序递归启动 |
| formal CLI 动态脚本执行 | 高 | 中高 | 必须在冻结 Runtime 中执行外部生成的 Python 文件 |
| 包内 YAML／Web UI | 高 | 低 | PyInstaller 数据收集即可 |
| canonical Runtime 源码资源 | 高 | 中 | 必须保持唯一事实源和字节一致性 |
| Playwright driver 收集 | 高 | 中 | 现有 `webcli-py` 已证明可打包，完整依赖集仍需重新验证 |
| macOS `onedir`／`.app`／DMG | 高 | 中 | 需要真实启动、子进程、DMG 挂载和签名边界验证 |
| Windows `onedir`／安装器 | 高 | 中高 | 需要 DLL 环境、进程树取消和实机安装验证 |

综合判断：

- 技术可行性：高。
- 业务影响：低。
- 基础设施改动：中等。
- 跨平台验证成本：中高。
- 最大风险：冻结 Worker 启动、formal CLI 动态执行、Windows 外部浏览器环境。

## 十一、验证设计

### 11.1 路径

- 默认解析到 `~/.weworker/webwright`。
- `WEBWRIGHT_HOME` 覆盖生效。
- Windows `%USERPROFILE%` 与 POSIX Home 解析正确。
- 所有 Store 位于预期子目录。
- 测试不会写入真实用户目录。
- 不探测旧 `outputs/` 或旧 Profile。

### 11.2 RuntimeLauncher

- 四类 Worker 的源码命令正确。
- 四类 Worker 的冻结命令正确。
- 未知 Worker 被拒绝。
- `script_command()` 保持脚本参数、工作目录、标准输出和退出码。
- Server 取消能够结束完整 Worker 进程树。

### 11.3 资源

- 安装包可读取全部内置 YAML。
- `/ui` 可加载 HTML、CSS 和 JavaScript。
- Publisher 读取的 canonical Runtime 与源码逐字节一致。
- 四文件 Skill 构建、hash 和只读导出保持不变。

### 11.4 真实系统验收

1. 在无 Python、uv 和源码仓库依赖的环境中安装并启动。
2. 配置模型并完成一次 Exploration。
3. 完成 Development → Debug → Publish。
4. formal Debug 真实执行已发布 `scripts/toolkit.py`。
5. 导出四文件 Skill，并用 WeWorker 随包 `webcli-py` wrapper 调用 embedded runtime 执行。
6. 自动启动系统 Chrome／Edge，连接本地 CDP 并持久化 Profile。
7. 重启 Webwright 后任务、Toolkit、模型配置和浏览器登录状态仍存在。
8. 升级程序只替换 InstallRoot。
9. 卸载后 `~/.weworker/webwright` 默认保留。
10. macOS 和 Windows 分别完成实机验收；不得用单平台构建结果代替另一平台完成状态。

## 十二、实施顺序

1. 修改本方案列出的两份存量技术设计，使其从源码运行合同切换到逻辑 Runtime 合同。
2. 新增 `WebwrightPaths`，统一 WebwrightHome，并改造 Store 和 Browser Profile 路径。
3. 新增 RuntimeLauncher，在源码模式跑通全部现有回归和真实 CDP。
4. 改造 formal Debug、Publisher 和 canonical Runtime 资源读取。
5. 创建 `distribution/AGENTS.md` 和完整分发子项目。
6. 实现 PyInstaller `onedir` 构建与冻结入口。
7. 构建并验收 macOS 安装包。
8. 构建并验收 Windows 安装包。
9. 补充用户安装、启动、升级、卸载和数据目录说明。

每个阶段只有在对应自动化验证和真实平台验证通过后，才能在 Roadmap 中标为完成。

## 十三、最终判断

完整 Webwright 分发不是对现有业务架构的重写，而是替换源码运行载体：

```text
现有产品与业务合同
→ 统一 WebwrightHome
→ 统一 RuntimeLauncher
→ 统一包内资源访问
→ PyInstaller onedir
→ 平台安装器
```

应保持的核心边界：

- InstallRoot 与 `~/.weworker/webwright` 分离。
- 完整 Webwright 与 `webcli-py` 分离。
- 源码模式与安装模式共享业务代码。
- 内部 Worker 与外部系统浏览器使用不同进程环境。
- 不引入旧数据兼容和迁移负担。
- 不以打包为由改变 Toolkit 产品规则或四文件正式交付合同。
