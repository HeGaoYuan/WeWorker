import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '../lib/CommandPaletteContext.jsx'
import { GITHUB_RELEASES, GITHUB_REPO } from '../lib/siteConfig.js'

const COMMANDS = [
  { id: 'download', label: '下载 WeWorker', hint: '安装包与版本', to: '/download' },
  { id: 'quick-start', label: '快速开始', hint: '使用说明文档', to: '/docs/quick-start' },
  { id: 'demo', label: '效果示例', hint: '首页动画演示', to: '/#demo' },
  { id: 'features', label: '核心功能', hint: '产品能力', to: '/#features' },
  { id: 'releases', label: 'GitHub Releases', hint: '对外', href: GITHUB_RELEASES },
  { id: 'repo', label: '源代码仓库', hint: 'GitHub', href: GITHUB_REPO },
]

export default function CommandPalette() {
  const { open, close } = useCommandPalette()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    )
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const run = (cmd) => {
    close()
    if (cmd.href) {
      window.open(cmd.href, '_blank', 'noopener,noreferrer')
      return
    }
    if (cmd.to?.includes('#')) {
      const [path, hash] = cmd.to.split('#')
      navigate(path || '/')
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
      }, 120)
      return
    }
    if (cmd.to) navigate(cmd.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault()
      run(filtered[active])
    }
  }

  return (
    <div className="cmd-backdrop" role="presentation" onClick={close}>
      <div
        className="cmd-panel glow-border"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-input-wrap">
          <span className="text-muted text-sm" aria-hidden>
            ⌘
          </span>
          <input
            ref={inputRef}
            type="search"
            className="cmd-input"
            placeholder="搜索命令：下载、文档、示例…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <ul className="cmd-list">
          {filtered.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                type="button"
                className={`cmd-item ${i === active ? 'cmd-item-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(cmd)}
              >
                <span className="font-medium text-sm">{cmd.label}</span>
                <span className="text-xs text-muted">{cmd.hint}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted text-center">无匹配命令</li>
          )}
        </ul>
      </div>
    </div>
  )
}
