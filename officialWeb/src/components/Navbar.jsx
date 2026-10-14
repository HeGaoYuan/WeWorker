import { Link, useLocation } from 'react-router-dom'
import { GITHUB_ISSUES } from '../lib/siteConfig.js'

export default function Navbar({ theme, onToggleTheme }) {
  const { pathname } = useLocation()
  const isDark = theme === 'dark'

  return (
    <header className="nav-bar fixed top-0 left-0 right-0 z-[60]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-sm text-[rgb(var(--color-text))] hover:text-accent transition-colors"
        >
          <img src="/logo.png" alt="" className="w-6 h-6 rounded" />
          WeWorker
        </Link>

        <nav className="flex items-center gap-1.5">
          <Link
            to="/docs/quick-start"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              pathname.startsWith('/docs')
                ? 'text-[rgb(var(--color-text))] bg-surface'
                : 'text-muted hover:text-[rgb(var(--color-text))] hover:bg-surface/70'
            }`}
          >
            文档
          </Link>
          <Link
            to="/download"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              pathname === '/download'
                ? 'text-[rgb(var(--color-text))] bg-surface'
                : 'text-muted hover:text-[rgb(var(--color-text))] hover:bg-surface/70'
            }`}
          >
            下载
          </Link>
          <Link
            to="/stats"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              pathname === '/stats'
                ? 'text-[rgb(var(--color-text))] bg-surface'
                : 'text-muted hover:text-[rgb(var(--color-text))] hover:bg-surface/70'
            }`}
          >
            统计
          </Link>
          <a
            href={GITHUB_ISSUES}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-sm text-muted hover:text-[rgb(var(--color-text))] hover:bg-surface/70 transition-colors"
          >
            反馈问题
          </a>
          <button
            type="button"
            onClick={onToggleTheme}
            className="ml-1 inline-flex h-9 items-center rounded-full border border-border bg-surface px-1.5 hover:border-accent/30 transition-colors"
            aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                !isDark ? 'bg-amber-500/15 text-amber-500' : 'text-muted'
              }`}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" />
              </svg>
            </span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                isDark ? 'bg-accent/12 text-accent' : 'text-muted'
              }`}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 12.79A9 9 0 1 1 11.21 3c0 .15-.01.3-.01.45A7.5 7.5 0 0 0 20.55 12c.15 0 .3 0 .45-.01Z" />
              </svg>
            </span>
          </button>
        </nav>
      </div>
    </header>
  )
}
