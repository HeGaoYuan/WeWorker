# 设置与配置

点击 WeWorker 左下角的设置图标打开设置面板。

## 模型设置

### 选择 AI 提供商

WeWorker 支持多个 AI 提供商，可以随时切换：

| 提供商 | 推荐模型 | 特点 |
|--------|---------|------|
| Anthropic Claude | claude-opus-4-6 | 最强的工具调用能力，推荐 |
| 智谱 GLM | glm-4.7 | 国内访问友好 |
| DeepSeek | deepseek-chat | 性价比高 |
| 自定义 | 任意 | 兼容 Anthropic API 的端点 |

### 配置步骤

1. 点击对应提供商的"配置"按钮
2. 填入 API Key
3. 选择模型
4. 点击"保存"
5. 点击"切换使用"激活该提供商

### 测试连接

配置完成后，点击"测试"按钮验证 API Key 是否有效。

## 网站设置

在"网站"标签页，可以管理各个网站适配器的启用状态。

- 默认所有已安装的适配器都是启用状态
- 关闭某个网站的适配器后，AI 将无法操作该网站

## 通道设置

详见[消息通道文档](/docs/channels)。

## 数据存储

WeWorker 的所有数据存储在本地：

- **macOS**：`~/.weworker/`
- **Windows**：`%USERPROFILE%\.weworker\`

包含：
- `settings.json`：应用配置（API Key 等）
- `works.db`：对话记录和定时任务数据（SQLite）

> ⚠️ API Key 以明文存储在 settings.json 中，请注意保护该文件。

## 主题切换

点击顶部标题栏右侧的图标，可以在深色和浅色主题之间切换。
