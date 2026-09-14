# 诺诺网发票

诺诺网发票平台：获取发票信息、下载 PDF/OFD/XML、自动下载并返回 QQ 邮箱

Matches: nnfp.jss.com.cn

> Requires authentication. User must be logged in to the website.

## Tools (4)

### nnfp.jss.com.cn.get_invoice_info

获取诺诺网发票页面的信息

### nnfp.jss.com.cn.download_invoice

点击下载按钮下载发票（PDF/OFD/XML）。支持指定下载路径。

Parameters:

- `format`: string — 下载格式：pdf、ofd、xml 或 auto（自动选择）
- `downloadPath`: string — 下载路径（可选），相对于浏览器默认下载目录的子路径，例如：

### nnfp.jss.com.cn.auto_download_and_return

自动下载发票并返回QQ邮箱（完整流程）。支持指定下载路径。

Parameters:

- `format`: string — 下载格式：pdf、ofd、xml 或 auto
- `downloadPath`: string — 下载路径（可选），相对于浏览器默认下载目录的子路径，例如：

### nnfp.jss.com.cn.return_to_qqmail

关闭当前页面并返回QQ邮箱
