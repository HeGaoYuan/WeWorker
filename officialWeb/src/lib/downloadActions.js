/** 对外站：不做内网下载统计上报 */

export async function reportDownload() {}

export function triggerFileDownload(href) {
  if (href.startsWith('http')) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function reportDownloadThenGo(href, _platform) {
  triggerFileDownload(href)
}
