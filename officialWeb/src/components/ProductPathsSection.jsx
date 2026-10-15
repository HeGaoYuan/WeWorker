import { Link } from 'react-router-dom'
import { useState } from 'react'
import ScrollReveal from './ScrollReveal.jsx'
import { copyToClipboard } from '../lib/copyToClipboard.js'
import { ADAPTER_REPO, GITHUB_RELEASES } from '../lib/siteConfig.js'

const SKILL_INSTALL_CMD = 'webcli install --skills'

function CopyChip({ text, label = '复制' }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="mt-4 rounded-xl border border-border bg-[rgb(var(--color-bg))]/80 px-3 py-2.5 flex items-start gap-2 text-left">
      <code className="flex-1 min-w-0 text-xs sm:text-sm font-mono text-[rgb(var(--color-text))] break-all leading-relaxed">
        {text}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover transition-colors px-2 py-1 rounded-lg hover:bg-accent/10"
      >
        {copied ? '已复制' : label}
      </button>
    </div>
  )
}

const COMPARE_ROWS = [
  { label: '形态', client: '桌面应用（macOS / Windows）', skill: 'SKILL.md 文档包' },
  { label: '主要用途', client: '对话、定时任务、消息通知、托管 Bridge', skill: '教 Agent 如何调用各站点工具' },
  { label: '依赖', client: 'Chrome + 扩展', skill: '可配合其他 Agent，按场景个性化自定义使用' },
  { label: '推荐获取', client: '官网下载 / GitHub Releases', skill: '桌面端同步或 webcli install --skills' },
]

export default function ProductPathsSection() {
  return (
    <section id="get-started" className="section-pad py-16 sm:py-20 px-4 sm:px-6 border-b border-border">
      <div className="max-w-page mx-auto">
        <ScrollReveal className="text-center mb-10 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-[rgb(var(--color-text))] mb-3">客户端与 Skill</h2>
          <p className="text-muted text-base sm:text-lg leading-relaxed">
            <strong className="font-medium text-[rgb(var(--color-text))]">WeWorker 客户端</strong>
            是运行环境；
            <strong className="font-medium text-[rgb(var(--color-text))]"> Skill</strong>
            是给 AI 的站点操作说明。两者配合，但下载入口不同。
          </p>
        </ScrollReveal>

        <div className="grid lg:grid-cols-2 gap-5 mb-10">
          <ScrollReveal>
            <article className="glass glow-border rounded-2xl p-6 sm:p-7 h-full flex flex-col border border-border card-lift">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/15">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">WeWorker 桌面客户端</h3>
                  <p className="text-xs text-muted">含 WebCLI · Bridge · 扩展资源</p>
                </div>
              </div>
              <p className="text-sm text-muted leading-relaxed flex-1">
                安装后即可对话、配置模型与定时任务。WebCLI 随客户端维护，Chrome 扩展从安装目录加载，无需单独下载命令行包。
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">·</span>
                  <span>从下载页选择 macOS / Windows 安装包</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">·</span>
                  <span>
                    或从{' '}
                    <a href={GITHUB_RELEASES} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      GitHub Releases
                    </a>{' '}
                    获取最新版
                  </span>
                </li>
              </ul>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/download" className="hero-cta-primary justify-center text-center">
                  下载客户端
                </Link>
                <Link to="/docs/quick-start" className="hero-cta-secondary justify-center text-center">
                  安装指南
                </Link>
              </div>
            </article>
          </ScrollReveal>

          <ScrollReveal delay={80}>
            <article className="glass glow-border rounded-2xl p-6 sm:p-7 h-full flex flex-col border border-border card-lift">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/15">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">Adapter Skill</h3>
                  <p className="text-xs text-muted">Agent 可读的操作说明</p>
                </div>
              </div>
              <p className="text-sm text-muted leading-relaxed flex-1">
                每个网站的工具名、参数与示例命令写在 Skill 中。桌面端可自动同步；也可在终端安装到 Claude Code / Cursor 等 Agent 的 skills 目录。
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">·</span>
                  <span>打开 WeWorker 后，在应用内启用站点 Skill（工具包）</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">·</span>
                  <span>终端执行下方命令，或从 Adapter 仓库复制 SKILL.md</span>
                </li>
              </ul>
              <CopyChip text={SKILL_INSTALL_CMD} />
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/docs/skills" className="hero-cta-primary justify-center text-center">
                  Skill 使用说明
                </Link>
                <a
                  href={ADAPTER_REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="hero-cta-secondary justify-center text-center"
                >
                  Adapter 仓库
                </a>
              </div>
            </article>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={120}>
          <div className="overflow-x-auto rounded-2xl border border-border glass glow-border">
            <table className="w-full min-w-[520px] text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="px-4 py-3 font-medium text-muted w-[22%]">对比项</th>
                  <th className="px-4 py-3 font-semibold text-[rgb(var(--color-text))]">桌面客户端</th>
                  <th className="px-4 py-3 font-semibold text-[rgb(var(--color-text))]">Skill</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted align-top">{row.label}</td>
                    <td className="px-4 py-3 text-[rgb(var(--color-text))]/90 align-top">{row.client}</td>
                    <td className="px-4 py-3 text-[rgb(var(--color-text))]/90 align-top">{row.skill}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
