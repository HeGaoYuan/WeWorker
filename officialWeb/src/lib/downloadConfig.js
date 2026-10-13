/**
 * 安装包放在 officialWeb/public/downloads/，构建后访问路径为 /downloads/<filename>
 * 发版时：1) 更新 APP_VERSION  2) 将产物放入 public/downloads 且文件名与下方 filename 一致
 * 命名约定见 public/downloads/README.md
 */
export const APP_VERSION = '1.1.0'

/** 下载统计上报（POST JSON：{ version, platform }） */
export const DOWNLOAD_REPORT_URL = '/api/downloads'

/** 下载统计汇总（GET JSON：{ platforms[], grand_total }） */
export const DOWNLOAD_SUMMARY_URL = '/api/downloads/summary'

/** 站点内下载目录（对应 Vite public/downloads） */
const DOWNLOAD_BASE = '/downloads'

const localDownload = (filename) => `${DOWNLOAD_BASE}/${encodeURIComponent(filename)}`

export const DOWNLOADS = [
  {
    id: 'windows',
    title: 'Windows 下载',
    subtitle: 'Windows 10 / 11（x64）',
    filename: `WeWorker-${APP_VERSION}-win-x64.exe`,
    href: localDownload(`WeWorker-${APP_VERSION}-win-x64.exe`),
    icon: 'windows',
    platform: 'win-x64',
  },
  {
    id: 'mac-intel',
    title: 'Mac Intel 下载',
    subtitle: 'Intel 芯片（x64）',
    filename: `WeWorker-${APP_VERSION}-mac-x64.dmg`,
    href: localDownload(`WeWorker-${APP_VERSION}-mac-x64.dmg`),
    icon: 'mac',
    platform: 'mac-x64',
  },
  {
    id: 'mac-apple',
    title: 'Mac Apple下载',
    subtitle: 'Apple 芯片（M 系列）',
    filename: `WeWorker-${APP_VERSION}-mac-arm64.dmg`,
    href: localDownload(`WeWorker-${APP_VERSION}-mac-arm64.dmg`),
    icon: 'mac',
    platform: 'mac-arm64',
  },
]
