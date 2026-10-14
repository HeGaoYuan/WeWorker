const CHANNEL_NAMES = { qq: 'QQ', weixin: '微信', wecom: '企业微信', feishu: '飞书' }

export function buildStatusAlerts({ extension, appVersion, extensionVersion, bridgeStatus, backendStatus, channels = {}, isWindows }) {
  const alerts = []
  if (extension !== 'connected') alerts.push({
    id: 'extension-disconnected', title: '浏览器扩展未连接',
    detail: '请打开 Chrome，确认 WeWorker 扩展已启用。', guide: true,
  })
  if (extension === 'connected' && appVersion && extensionVersion && appVersion !== extensionVersion) alerts.push({
    id: 'extension-version', title: '扩展版本不一致',
    detail: `客户端版本：v${appVersion}\n扩展版本：v${extensionVersion}\n请在 chrome://extensions 中刷新 WeWorker 扩展；若版本仍不一致，请安装与客户端配套的扩展。`, guide: true,
  })
  for (const [status, port, label] of [[bridgeStatus, 3711, '浏览器桥接'], [backendStatus, 8765, '后端服务']]) {
    if (status !== 'port_in_use') continue
    alerts.push({
      id: `port-${port}`, title: `${label}端口 ${port} 被占用`,
      detail: '请先检查占用进程，确认后关闭冲突的程序，再重启 WeWorker。',
      command: isWindows ? `netstat -ano | findstr :${port}` : `lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    })
  }
  for (const [name, info] of Object.entries(channels)) {
    if (info?.status !== 'error') continue
    alerts.push({ id: `channel-${name}`, title: `${CHANNEL_NAMES[name] || name}连接异常`,
      detail: info.error || '请在设置的通道配置中检查机器人连接信息。' })
  }
  return alerts
}
