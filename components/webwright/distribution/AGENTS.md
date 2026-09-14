# Webwright 完整分发子项目约定

## 范围

- 本目录只负责完整 Webwright harness 的 macOS／Windows `onedir` 构建，以及 standalone／embedded 两种交付形态。
- 不恢复已废弃的独立 `installer/` 或第二套 Python／Playwright Runtime；WeWorker 内置 WebCLI 直接调用 embedded runtime 的 `--internal-script`，不再提供 `webcli-py` wrapper。
- 运行时只关注 `local_browser + local_cdp`，使用系统 Chrome／Edge，不下载浏览器。

## 分发形态

- standalone 只保留现有兼容构建能力，不作为独立仓库或独立产品继续迭代；WeWorker 正式交付只使用 embedded。
- embedded 是供 WeWorker 打包的伴生运行时：只输出裸运行所需的 `onedir`，不得生成独立 `.app`、DMG、Inno Setup 安装器、桌面入口、启动项或更新器。
- 两种形态必须共享同一 PyInstaller 入口、资源收集规则和冻结运行时实现，不维护两套 Webwright 业务代码。
- embedded 产物由 WeWorker 管理安装、启动、退出、升级和卸载；Webwright 继续管理 `~/.webwright` 用户数据。

## 构建合同

- 使用 `uv` 管理独立构建环境，版本由本目录 `pyproject.toml` 和 `uv.lock` 固定。
- 构建入口为 `uv run --project distribution python distribution/scripts/build.py`；新增模式参数时必须保持 standalone 默认行为兼容。
- PyInstaller 入口必须使用 `webwright.run.bootstrap`，保留内部 Worker／脚本分发。
- 产物为 `onedir`，不得切换为 `onefile`。
- standalone macOS 以 `.app` 为中间产物，构建脚本必须继续封装并最终输出按架构命名的 DMG；当前 arm64 文件名固定为 `Webwright-macos-arm64.dmg`。
- standalone Windows 以 `onedir` 为中间产物，构建脚本必须继续调用 Inno Setup 并最终输出 `Webwright-windows-x64-Setup.exe`；不得要求用户手工执行第二段安装器构建。
- embedded 必须输出可由 Electron `extraResources` 原样收集的 `onedir`，并包含可校验版本、平台、架构、模式和入口的运行时 manifest；不记录组件级 commit 或 dirty 状态。
- 必须收集内置 YAML、Web UI、canonical `toolkit_runtime.py`、Playwright 包与 driver、动态模型／环境／Agent 模块。
- 不把 `.env`、`models.json`、Task、Toolkit、浏览器 Profile 或其他 `~/.webwright` 数据打入安装包。
- embedded 产物必须包含 `THIRD_PARTY_NOTICES.txt` 和 `licenses/`，按实际冻结环境列出组件名称、准确版本、许可证、源码地址及随包许可证文件。
- Webwright MIT、CPython PSF、Playwright Apache 2.0／NOTICE、PyInstaller Bootloader Exception 和 certifi MPL 2.0／源码获取说明是强制分发合同；任一材料缺失时构建必须失败。
- 第三方许可证从当前锁定构建环境提取，不手工复制依赖版本；`setuptools` 等被 PyInstaller 实际冻结的间接／vendored 组件同样必须纳入。

## 平台边界

- macOS 和 Windows 必须在各自平台构建并验收，不交叉构建。
- embedded 产物必须与最终 WeWorker 安装包的平台和架构一致；不得将同一原生运行时复用于不同架构。
- Windows 构建机必须安装 Inno Setup 6；构建脚本从 `PATH` 或当前用户／系统的标准安装位置发现 `ISCC.exe`，找不到时必须明确失败。
- 签名、公证、商店发布、自动更新与生产发布不在当前范围。
- 安装／卸载脚本不得默认删除 `~/.webwright`。

## 验证

- 先运行根项目回归，再运行 `distribution/tests/`。
- standalone 构建后至少验证最终 DMG 可挂载、其中只包含可启动的 `Webwright.app`，并验证可执行文件 `--help`、内置 UI 静态资源和一个内部 Worker 参数错误路径。
- embedded 构建后至少验证 runtime manifest、可执行文件 `--help`、内置 UI 静态资源、一个内部 Worker 参数错误路径、`/api/health` 和退出后端口释放。
- embedded 构建后必须验证第三方 notices、关键许可证全文和 certifi 准确版本源码获取说明均已进入最终 `onedir`。
- 未在目标平台真实验证的产物不得标记为已完成。
