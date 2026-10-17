/**
 * Display helpers for WeWorker 浏览器, the Chrome instance the desktop app
 * starts with its own profile so website automation never disturbs the user.
 */
export const BROWSER_MODE_OPTIONS = [
  { value: 'dedicated', label: 'WeWorker 浏览器（推荐）' },
  { value: 'system', label: '我自己的 Chrome' },
]

export function describeBrowserMode(mode) {
  return mode === 'system'
    ? '网站操作在你日常使用的 Chrome 中进行，需要手动安装扩展；执行时会打开或切换 Chrome 标签页。'
    : 'WeWorker 自动启动独立的 Chrome（单独的配置和登录状态），窗口放在屏幕外，执行网站操作时不会打扰你。首次使用某个网站时，需要在 WeWorker 浏览器中登录一次。'
}

/** One line of status text plus the actions that make sense for it. */
export function describeDedicatedBrowserStatus(status) {
  const state = status?.status || 'stopped'
  const browser = status?.browser || 'Chrome'
  switch (state) {
    case 'running':
      return { tone: 'ok', text: `WeWorker 浏览器（${browser}）正在后台运行。`, canShow: true, canRestart: true }
    case 'starting':
      return { tone: 'pending', text: 'WeWorker 浏览器正在启动…', canShow: false, canRestart: false }
    case 'profile_in_use':
      return { tone: 'warn', text: 'WeWorker 浏览器的配置正被另一个浏览器进程使用，稍后会自动重试。', canShow: false, canRestart: true }
    case 'unavailable':
      return { tone: 'warn', text: `无法启动 WeWorker 浏览器：${status?.detail || '未找到 Chrome'}。请安装 Chrome，或在设置中改用自己的 Chrome。`, canShow: false, canRestart: true }
    case 'error':
      return { tone: 'error', text: `WeWorker 浏览器多次启动失败${status?.detail ? `：${status.detail}` : ''}。`, canShow: false, canRestart: true }
    default:
      return { tone: 'pending', text: 'WeWorker 浏览器未运行。', canShow: false, canRestart: true }
  }
}
