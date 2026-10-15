import { useState } from 'react'
import { copyToClipboard } from '../lib/copyToClipboard.js'

const COMMAND =
  '请帮我安装并接入 WebCLI，使用 webcli call 调用 Adapter 完成网页任务。'

export default function HeroCommandBar() {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const ok = await copyToClipboard(COMMAND)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
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
          className="hero-command-copy shrink-0"
          aria-label="复制命令"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )
}
