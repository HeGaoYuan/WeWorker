# Gmail

Gmail：读取邮件列表、搜索邮件、查看邮件详情、下载附件

Matches: mail.google.com

> Requires authentication. User must be logged in to the website.

## Tools (7)

### mail.google.com.check_login_status

检测 Gmail 是否已登录。打开 Gmail 后应首先调用此工具确认登录状态，未登录时需提醒用户先登录。

### mail.google.com.navigate_to_inbox

Navigate to the Gmail inbox homepage. Use this before multi-step operations to ensure a clean starting state.

### mail.google.com.search_emails

Search Gmail by keyword and return matching email threads

Parameters:

- `keyword`: string **(required)** — Search term, e.g.

### mail.google.com.get_unread_emails

Get unread emails from the Gmail inbox

Parameters:

- `limit`: number — Maximum number of emails to return. Default: 20

### mail.google.com.open_email

Open a Gmail email thread and return its full content including body and attachments. Use the email ID from search_emails or get_unread_emails.

Parameters:

- `emailId`: string **(required)** — Thread ID returned by search_emails or get_unread_emails

### mail.google.com.download_attachment

Download an attachment from the currently open Gmail email. You must call open_email first.

Parameters:

- `attachmentName`: string **(required)** — Exact filename to download (e.g.

### mail.google.com.get_current_page_info

Get the current Gmail page state — useful for checking whether you are in the inbox, reading an email, or composing.
