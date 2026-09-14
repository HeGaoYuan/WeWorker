# 消息通道

消息通道让你通过 IM 直接与 AI 对话，也能接收定时任务的执行通知。

## 企业微信

通过企业微信智能机器人接入。

### 创建机器人

**第一步：** 打开企业微信，在工作台找到「智能机器人」

<img src="/images/wecom-step1.png" alt="在工作台找到智能机器人" />

**第二步：** 点击创建机器人，选择「手动创建」

<img src="/images/wecom-step2.png" alt="选择手动创建" />

**第三步：** 滑动到最下面，选择「API 模式」创建

<img src="/images/wecom-step3.png" alt="选择API模式" />

**第四步：** 在创建页面，将「可使用成员」去掉除自己外的其他人，连接方式选择「长连接」，点击获取 Secret

<img src="/images/wecom-step4.png" alt="配置机器人并获取Secret" />

**第五步：** 打开 WeWorker 设置 → 通道 → 企业微信，输入刚才创建的 BotID 和 Secret，启用并保存

<img src="/images/wecom-step5.png" alt="在WeWorker中配置企业微信" />

### 使用方式

- 在企业微信中直接发消息给机器人即可对话
- 发送 `/new` 开启新对话
- 发送 `/id` 查询当前对话 ID

## 微信

通过 iLink Bot 接入微信。

1. 前往设置 → 通道 → 微信，点击"扫码登录"
2. 使用微信扫描二维码，扫码成功后启用并保存

> 微信通道需要用户先主动发消息给机器人，之后才能接收主动推送。

## QQ

通过 QQ 开放平台接入 QQ 机器人，仅支持私聊。

1. 前往 [QQ 开放平台](https://q.qq.com/) 创建机器人，获取 AppID 和 AppSecret
2. 在设置 → 通道 → QQ 中填入凭证，启用并保存

## 跨通道追踪

每个对话都有唯一的短 ID（8位）。在 IM 中发送 `/id` 获取，然后在 WeWorker 桌面端搜索该 ID 即可找到对应对话。
