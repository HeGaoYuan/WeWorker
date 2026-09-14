import { APP_VERSION, DOWNLOAD_REPORT_URL } from './downloadConfig.js'

export async function reportDownload(platform) {
  try {
    await fetch(DOWNLOAD_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: APP_VERSION, platform }),
    })
  } catch {
    // 上报失败不阻断下载
  }
}

export function triggerFileDownload(href) {
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function reportDownloadThenGo(href, platform) {
  await reportDownload(platform)
  window.location.href = href
}
