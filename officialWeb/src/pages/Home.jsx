import { Link } from 'react-router-dom'
import WeWorkerAnimation from '../components/WeWorkerAnimation.jsx'
import sitesData from '../lib/sites.json'

// Collect all site names for the feature description
const ALL_SITE_NAMES = sitesData.groups
  .flatMap(g => g.sites)
  .map(s => s.name)
  .join('、')

const GITHUB = 'https://github.com/WeWorker/WeWorker'

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: '浏览器自动化',
    desc: '通过 Chrome 扩展，AI 可以直接操作任意网页——点击、填表、搜索、下单，无需网站提供 API。',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: '定时任务',
    desc: '设置定时任务，让 AI 在指定时间自动执行任务，并通过微信、QQ、企业微信推送执行结果。',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: '多通道通知',
    desc: '支持微信、QQ、企业微信机器人通道，任务完成后主动推送消息，随时随地掌握执行结果。',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    title: '可扩展 Adapter',
    desc: `通过 Adapter 机制支持任意网站。目前已适配 ${ALL_SITE_NAMES} 等网站，也可以自己编写。`,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: '本地运行，数据安全',
    desc: '所有对话记录和配置存储在本地，不经过任何第三方服务器。你的数据只属于你。',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: '多模型支持',
    desc: '支持 Anthropic Claude、GLM、DeepSeek 及自定义 API 端点，灵活选择适合你的 AI 模型。',
  },
]

const STEPS = [
  {
    num: '01',
    title: '下载 WeWorker',
    desc: '从 GitHub Releases 下载 macOS 或 Windows 安装包，安装后打开应用。',
    action: '前往下载',
    href: '/download',
  },
  {
    num: '02',
    title: '安装 Chrome 扩展',
    desc: '安装 WeWorker Browser Adapter 扩展，让 AI 获得操作浏览器的能力。',
    action: '查看说明',
    href: '/docs/quick-start',
  },
  {
    num: '03',
    title: '配置 API Key',
    desc: '在设置中填入 Claude 或其他模型的 API Key，即可开始对话。',
    action: '查看文档',
    href: '/docs/quick-start',
  },
]

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[500px] bg-accent/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">


          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[rgb(var(--color-text))] leading-tight mb-6">
            WeWorker, 你的{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-400">
              AI 网页助理
            </span>
          </h1>

          <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed mb-10">
            通过为每个网站编写专属 Adapter，AI 精准操作浏览器，替你完成查邮件、提工单、填表单等日常网页工作。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/download"
              className="px-6 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              免费下载
            </Link>
            <a
              href="/docs/quick-start"
              className="px-6 py-3 rounded-lg border border-border hover:border-accent/30 bg-surface/50 text-muted hover:text-[rgb(var(--color-text))] font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              快速开始
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Animation Demo */}
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-[rgb(var(--color-text))] mb-4">效果示例</h2>
            <p className="text-muted text-base sm:text-lg leading-relaxed">
              发票报销，总是<span className="text-[rgb(var(--color-text))] font-medium">繁琐而重复</span>。
            </p>
            <p className="text-accent text-base sm:text-lg leading-relaxed mt-2 font-medium">
              现在，一句话就够了。
            </p>
            <div className="mt-4 inline-block rounded-lg bg-surface border border-border px-5 py-3 font-mono text-sm text-muted">
              <span className="text-accent/70 mr-1.5">›</span> 帮我从邮箱下载这个月所有发票，上传范妮思并提交
            </div>
          </div>
          <WeWorkerAnimation />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-surface/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[rgb(var(--color-text))] mb-4">核心功能</h2>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              不只是聊天，而是真正帮你干活的 AI 助手
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-5 hover:border-accent/30 transition-colors">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-[rgb(var(--color-text))]">{f.title}</h3>
                </div>
                <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section id="download" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[rgb(var(--color-text))] mb-4">快速开始</h2>
            <p className="text-muted">三步完成安装，5 分钟上手</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {STEPS.map((step, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-6 flex flex-col">
                <div className="text-3xl font-bold text-accent/30 font-mono mb-4">{step.num}</div>
                <h3 className="text-[rgb(var(--color-text))] font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed flex-1 mb-4">{step.desc}</p>
                {step.href.startsWith('http') ? (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:text-accent-hover text-sm font-medium transition-colors"
                  >
                    {step.action}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </a>
                ) : (
                  <Link
                    to={step.href}
                    className="inline-flex items-center gap-1 text-accent hover:text-accent-hover text-sm font-medium transition-colors"
                  >
                    {step.action}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="relative overflow-hidden bg-gradient-to-br from-surface via-surface to-accent/5 border border-border rounded-2xl p-8 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <h3 className="text-2xl font-bold text-[rgb(var(--color-text))] mb-3">准备好了吗？</h3>
              <p className="text-muted mb-6">让 AI 替你操作浏览器，一句话完成网页上的繁琐工作</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/download"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  下载 WeWorker
                </Link>
                <Link
                  to="/docs/quick-start"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg border border-border hover:border-accent/30 text-muted hover:text-[rgb(var(--color-text))] font-semibold transition-colors"
                >
                  查看文档
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
