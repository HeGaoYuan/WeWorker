const PRESENTATIONS = {
  starting: { label: '网站探索 agent 启动中', enabled: false, tone: 'warning' },
  running: { label: '打开网站探索 agent', enabled: true, tone: 'success' },
  error: { label: '网站探索 agent 启动失败', enabled: false, tone: 'error' },
  port_in_use: { label: '端口 8766 被占用', enabled: false, tone: 'warning' },
  version_mismatch: { label: '网站探索 agent 版本不匹配', enabled: false, tone: 'error' },
  stopped: { label: '网站探索 agent 已停止', enabled: false, tone: 'muted' },
}

export function getWebwrightPresentation(status) {
  return PRESENTATIONS[status] || { label: '网站探索 agent 状态未知', enabled: false, tone: 'muted' }
}
