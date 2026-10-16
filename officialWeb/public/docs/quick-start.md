# 快速开始

5 分钟完成安装，开始你的第一次 AI 自动化体验。

## 系统要求

- Google Chrome
- Windows 使用系统自带 PowerShell，无需额外安装 Git for Windows

## 第一步：下载并安装 WeWorker

在下方下载区选择对应系统的安装包，安装后打开应用。

- **macOS**：首次打开前需在终端运行 `xattr -cr /Applications/WeWorker.app`，否则会提示"已损坏"
- **Windows**：直接安装 WeWorker 即可，命令执行使用系统自带 PowerShell

[[component:download-cards]]

## 第二步：安装 Chrome 扩展

WeWorker 需要配合 Chrome 扩展才能操作浏览器。扩展已包含在安装包中，无需额外下载，只需安装即可。

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角的**开发者模式**
3. 点击**加载未打包的扩展程序**
4. 选择以下路径中的 `extension` 文件夹：
   - **macOS**：`/Applications/WeWorker.app/Contents/Resources/extension`
   - **Windows**：`%LOCALAPPDATA%\Programs\WeWorker\resources\extension`

[[component:chrome-extensions-ui]]

> 扩展安装成功后，Chrome 右上角会出现 WebMCP 图标。

## 第三步：配置 AI 模型

1. 打开 WeWorker，点击左下角的设置图标
2. 在"模型"标签页选择你的 AI 提供商，填入 API Key，点击"保存"

<details>
<summary>查看支持的模型提供商</summary>

- **Anthropic Claude**（推荐）：[获取 API Key](https://console.anthropic.com/)
- **智谱 GLM**：[获取 API Key](https://open.bigmodel.cn/)
- **DeepSeek**：[获取 API Key](https://platform.deepseek.com/)
- **自定义**：兼容 Anthropic API 格式的任意端点

</details>

## 第四步（可选）：安装 Adapter Skill

Skill 是教 AI 如何调用各站点 `webcli` 工具的说明文档，与桌面客户端是不同下载物。WeWorker 可在应用内自动同步 Skill；也可在终端执行 `webcli install --skills`。详见 [Skill 安装与使用](/docs/skills)。

## 第五步：开始对话

1. 点击左上角的 "+" 新建对话
2. 在 Chrome 中打开你想操作的网站（如京东、Gmail），确保已登录
3. 在 WeWorker 中输入你的指令，例如：

```
帮我查看京东这个月的消费记录，整理成表格
```

> **提示**：建议提前在 Chrome 中打开目标网站并完成登录，再发送指令，体验更流畅。

## 常见问题

<details>
<summary>Chrome 扩展图标显示"未连接 MCP host"</summary>

- 确认 WeWorker 应用正在运行
- 在 `chrome://extensions/` 中点击 WebMCP 扩展的刷新图标重新加载

</details>

<details>
<summary>WeWorker 应用左下角显示"扩展未连接"</summary>

- 可能未安装 Chrome 扩展，请参考第二步完成安装
- 可能 Chrome 未打开，打开 Chrome 后状态会自动恢复

</details>

<details>
<summary>macOS 提示"已损坏，无法打开"</summary>

- 在终端运行 `xattr -cr /Applications/WeWorker.app` 后重新打开即可

</details>

## 下一步

- 了解如何设置[定时任务](/docs/scheduled-tasks)
- 配置[消息通道](/docs/channels)接收通知
- 查看支持的[网站适配器](/docs/adapters)
