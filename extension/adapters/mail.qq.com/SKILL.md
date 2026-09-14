---
name: "webcli-mail.qq.com"
description: "QQ邮箱：搜索邮件、读取未读、打开邮件、下载附件、按关键词/月份批量下载发票"
allowed-tools: Bash(webcli *)
---

# QQ邮箱

QQ邮箱：搜索邮件、读取未读、打开邮件、下载附件、按关键词/月份批量下载发票

Matches: mail.qq.com

Homepage: https://mail.qq.com/

> Requires authentication. User must be logged in to the website.

## Tools (9)

### mail.qq.com.check_login_status

检测 QQ 邮箱是否已登录。打开 QQ 邮箱后应首先调用此工具确认登录状态，未登录时需提醒用户先在浏览器中登录。

```bash
webcli call mail.qq.com.check_login_status
```

### mail.qq.com.navigate_to_inbox

返回 QQ 邮箱收件箱首页。当需要执行多步骤操作（如批量下载附件）或当前页面状态不明确时，使用此工具回到初始状态。

```bash
webcli call mail.qq.com.navigate_to_inbox
```

### mail.qq.com.search_emails

在 QQ 邮箱中搜索邮件。未传关键词时默认搜索「发票」。

Parameters:

- `keyword`: string — 搜索关键词，例如「合同」「会议」。不传或为空时默认为「发票」。

```bash
webcli call mail.qq.com.search_emails --keyword=发票
```

### mail.qq.com.get_unread_emails

获取 QQ 邮箱收件箱中的未读邮件列表。

Parameters:

- `limit`: number — 最多返回的邮件数量，默认 20

```bash
webcli call mail.qq.com.get_unread_emails --limit=20
```

### mail.qq.com.open_email

打开 QQ 邮箱中的指定邮件，查看完整内容。邮件 ID 可以从 search_emails 或 get_unread_emails 的返回结果中获取。

Parameters:

- `emailId`: string **(required)** — 邮件的唯一 ID 或主题片段

```bash
webcli call mail.qq.com.open_email --emailId=<emailId>
```

### mail.qq.com.download_attachment

下载 QQ 邮箱中当前打开邮件的附件。使用前需要先调用 open_email 打开邮件。

Parameters:

- `attachmentName`: string **(required)** — 要下载的附件名称（例如 `发票.pdf`），或使用 `all` 打包下载所有附件

```bash
webcli call mail.qq.com.download_attachment --attachmentName=all
```

### mail.qq.com.get_current_page_info

获取当前 QQ 邮箱页面的状态信息，用于判断当前在哪个页面（收件箱、邮件详情等）。

```bash
webcli call mail.qq.com.get_current_page_info
```

### mail.qq.com.cancel_download_invoices_by_invoice

取消当前正在执行的发票批量下载任务。若任务在执行中，会在下一检查点尽快停止。

```bash
webcli call mail.qq.com.cancel_download_invoices_by_invoice
```

### mail.qq.com.download_invoices_by_invoice

按发票关键词批量下载 QQ 邮箱发票附件。时间条件由 AI 先解析后传入：可传 `day`（某日）或 `month`（某月），`day` 优先级高于 `month`。流程：按关键词搜索发票 → 按 day/month 过滤（可选）→ 逐封下载 → 返回结果。

Parameters:

- `invoiceKeyword`: string — 发票关键词，如「发票」「移动发票」。为空时默认「发票」。
- `month`: string — 明确月份（由 AI 解析后传入），如「4月」「04」「四月」。不传则不按月份筛选。
- `day`: string — 明确日期（由 AI 解析后传入），如「2026-04-26」「4月26日」。传入后优先按该日筛选。

```bash
webcli call mail.qq.com.download_invoices_by_invoice --invoiceKeyword=发票 --month=4月
```
