# 163邮箱

网易163邮箱：读取邮件列表、搜索邮件、查看邮件详情、下载附件、写邮件

Matches: mail.163.com

> Requires authentication. User must be logged in to the website.

## Tools (8)

### mail.163.com.check_login_status

检测163邮箱是否已登录。打开163邮箱后应首先调用此工具确认登录状态，未登录时需提醒用户先登录。

### mail.163.com.navigate_to_inbox

返回163邮箱收件箱首页。当需要执行多步骤操作（如批量下载附件）或当前页面状态不明确时，使用此工具返回初始状态。

### mail.163.com.search_emails

在163邮箱中搜索邮件，支持按关键词搜索

Parameters:

- `keyword`: string **(required)** — 搜索关键词，例如「发票」「合同」「会议」

### mail.163.com.get_unread_emails

获取163邮箱收件箱中的未读邮件列表

Parameters:

- `limit`: number — 最多返回的邮件数量，默认20

### mail.163.com.open_email

打开163邮箱中的指定邮件，查看完整内容。邮件ID可以从search_emails或get_unread_emails的返回结果中获取

Parameters:

- `emailId`: string **(required)** — 邮件的唯一ID，例如：1771635701103_741xtbC5RBFmml9PfBxwQAA3D_6fd294bhq81771635724863Dom

### mail.163.com.download_attachment

下载163邮箱中当前打开邮件的附件。使用前需要先调用open_email打开邮件。

Parameters:

- `attachmentName`: string **(required)** — 要下载的附件名称（例如：

### mail.163.com.get_current_page_info

获取当前163邮箱页面的状态信息，用于判断当前在哪个页面（收件箱、邮件详情、写信等）

### mail.163.com.compose_email

在163邮箱中写邮件：打开写信界面，自动填入收件人、主题、正文，并可选择发送、保存草稿或仅填充。支持添加附件（通过 file_path 传入本地文件路径）。多个收件人或抄送地址用分号分隔。

Parameters:

- `to`: string **(required)** — 收件人邮箱地址，多个用分号分隔，例如 alice@example.com;bob@example.com
- `subject`: string — 邮件主题
- `body`: string — 邮件正文内容（纯文本或 HTML 格式均可）
- `cc`: string — 抄送地址，多个用分号分隔
- `file_path`: string — 附件文件的本地绝对路径，通过 CDP 上传到浏览器
- `file_name`: string — 附件文件名（含扩展名），例如 report.pdf
- `action`: string — 操作类型：send 填写后直接发送（默认），draft 保存为草稿，fill 仅填充不执行操作
