const ITEMS = [
  { label: 'Apache-2.0', detail: '社区可贡献 Adapter' },
  { label: '本地优先', detail: '对话与配置在设备上' },
  { label: '真实浏览器', detail: '扩展继承登录态' },
  { label: '完整文档', detail: '快速开始与使用说明' },
]

export default function TrustStrip() {
  return (
    <ul className="trust-strip" aria-label="产品要点">
      {ITEMS.map((item) => (
        <li key={item.label} className="trust-strip-item">
          <span className="trust-strip-dot" aria-hidden />
          <div>
            <p className="text-sm font-medium text-[rgb(var(--color-text))]">{item.label}</p>
            <p className="text-xs text-muted mt-0.5">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
