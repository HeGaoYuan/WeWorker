import { useState } from 'react'
import CopyToast from './CopyToast.jsx'
import { useCopyToast } from '../lib/useCopyToast.js'

/** 点击「复制」写入剪贴板的完整安装指引（Hero 展示为短文案） */
const COPY_TEXT =
  '帮我装好 WebCLI：先跑 npx skills add https://unpkg.com/weworker-webcli/skills/webcli/SKILL.md，再跑 npm install -g weworker-webcli，然后 webcli extension-path 把完整路径发我，并列出在 Chrome 里加载该扩展的步骤（chrome://extensions/ → 开发者模式 → 加载未打包的扩展程序）。'

export default function HeroCommandBar() {
  const [copied, setCopied] = useState(false)
  const { copy, toastVisible } = useCopyToast()

  const onCopy = async () => {
    const ok = await copy(COPY_TEXT)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
    <CopyToast visible={toastVisible} />
    <div className="hero-command-bar glow-border mx-auto">
      <div className="hero-command-inner">
        <span className="hero-command-prompt font-mono text-accent" aria-hidden>
          &gt;_
        </span>
        <p className="hero-command-text text-sm sm:text-base text-muted text-left leading-relaxed flex-1 min-w-0">
          请帮我安装并接入 WebCLI，使用{' '}
          <code className="hero-command-code">webcli call</code>
          {' '}调用 Adapter 完成网页任务。
        </p>
        <button
          type="button"
          onClick={onCopy}
          className={`hero-command-copy shrink-0${copied ? ' hero-command-copy-done' : ''}`}
          aria-label="复制完整安装指引"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
    </>
  )
}
