import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DocsSidebar from '../components/DocsSidebar.jsx'
import ImageLightbox from '../components/ImageLightbox.jsx'
import SupportedSites from '../components/SupportedSites.jsx'
import { DOCS_SIDEBAR } from '../lib/docsConfig.js'
import { APP_VERSION, DOWNLOADS } from '../lib/downloadConfig.js'
import { reportDownloadThenGo } from '../lib/downloadActions.js'
import { slugify, getSupportedSitesHeadings } from '../lib/sitesHeadings.js'
import { getWecliHeadings } from '../lib/wecliHeadings.js'

// CRLF / lone CR breaks /^...$/ heading matches (`.+` cannot span `\r`). Normalize before parsing.
function normalizeMarkdown(md) {
  return md.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// ─── Heading helpers ──────────────────────────────────────────────────────────

function extractHeadings(markdown) {
  const headings = []
  for (const line of normalizeMarkdown(markdown).split('\n')) {
    const m = line.match(/^ {0,3}(#{2,3})\s+(.+)$/)
    if (m) {
      const text = m[2].replace(/`([^`]*)`/g, '$1')
      headings.push({ level: m[1].length, text, id: slugify(m[2]) })
    }
  }
  return headings
}

// ─── Minimal markdown renderer ────────────────────────────────────────────────

function renderMarkdown(md) {
  const lines = normalizeMarkdown(md).split('\n')
  const html = []
  let inCode = false
  let codeLines = []
  let inTable = false
  let tableRows = []

  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inlineFormat = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  const flushTable = () => {
    if (!tableRows.length) return
    const [header, , ...body] = tableRows
    const ths = header.split('|').filter(Boolean).map(c => `<th>${inlineFormat(c.trim())}</th>`).join('')
    const trs = body.map(row => {
      const tds = row.split('|').filter(Boolean).map(c => `<td>${inlineFormat(c.trim())}</td>`).join('')
      return `<tr>${tds}</tr>`
    }).join('')
    html.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`)
    tableRows = []
    inTable = false
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) { inCode = true; codeLines = []; continue }
      html.push(`<pre><code>${escHtml(codeLines.join('\n'))}</code></pre>`)
      inCode = false; codeLines = []; continue
    }
    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('|')) { inTable = true; tableRows.push(line); continue }
    if (inTable) flushTable()

    if (!line.trim()) continue

    const hm = line.match(/^ {0,3}(#{1,4})\s+(.+)$/)
    if (hm) {
      const level = hm[1].length
      const text = hm[2]
      const id = slugify(text)
      html.push(`<h${level} id="${id}">${inlineFormat(text)}</h${level}>`)
      continue
    }

    if (line.startsWith('> ')) { html.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`); continue }
    if (/^<\/?details|^<\/?summary|^<img /.test(line.trim())) { html.push(line); continue }
    if (line.startsWith('- ') || line.startsWith('* ')) { html.push(`<__ul_li>${inlineFormat(line.slice(2))}</__ul_li>`); continue }
    if (/^\d+\. /.test(line)) { html.push(`<__ol_li>${inlineFormat(line.replace(/^\d+\. /, ''))}</__ol_li>`); continue }
    html.push(`<p>${inlineFormat(line)}</p>`)
  }
  if (inTable) flushTable()

  // Wrap consecutive <__ul_li> / <__ol_li> into <ul> / <ol>
  const raw = html.join('\n')
  const wrapped = raw
    .replace(/(<__ul_li>.*?<\/__ul_li>\n?)+/gs, (m) => `<ul>${m.replace(/<\/?__ul_li>/g, (t) => t.includes('/') ? '</li>' : '<li>')}</ul>`)
    .replace(/(<__ol_li>.*?<\/__ol_li>\n?)+/gs, (m) => `<ol>${m.replace(/<\/?__ol_li>/g, (t) => t.includes('/') ? '</li>' : '<li>')}</ol>`)
  return wrapped
}

// ─── Inline components ───────────────────────────────────────────────────────

// Simulated Chrome extensions page showing developer mode + load button
function ChromeExtensionsUI() {
  return (
    <div className="my-6 rounded-xl border border-border overflow-hidden text-sm">
      {/* Chrome window chrome */}
      <div className="bg-[#dee1e6] flex items-center gap-2 px-3 py-2 border-b border-gray-300">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 bg-white rounded-full px-3 py-0.5 text-xs text-gray-500 mx-4">
          chrome://extensions/
        </div>
      </div>
      {/* Extensions page header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <span className="text-lg font-medium text-gray-800">扩展程序</span>
        <div className="flex items-center gap-3">
          {/* Developer mode toggle — highlighted */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 ring-2 ring-blue-400 ring-offset-1">
            <span className="text-xs text-gray-700">开发者模式</span>
            {/* Toggle ON */}
            <div className="w-9 h-5 rounded-full bg-blue-500 flex items-center justify-end pr-0.5 cursor-pointer">
              <div className="w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </div>
        </div>
      </div>
      {/* Toolbar with load button — highlighted */}
      <div className="bg-white px-6 py-3 border-b border-gray-200 flex items-center gap-3">
        <button className="px-3 py-1.5 text-xs border border-blue-500 text-blue-600 rounded ring-2 ring-blue-400 ring-offset-1 font-medium bg-blue-50">
          加载未打包的扩展程序
        </button>
        <button className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded">
          打包扩展程序
        </button>
      </div>
      {/* Caption */}
      <div className="bg-gray-50 px-6 py-2 text-xs text-gray-500 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 flex-shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        先开启右上角的<strong className="text-gray-700 mx-0.5">开发者模式</strong>，才会出现"加载未打包的扩展程序"按钮
      </div>
    </div>
  )
}

// Screenshot placeholder
function ScreenshotPlaceholder({ label }) {
  return (
    <div className="my-6 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-8 text-center">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted mx-auto mb-3">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function PlatformIcon({ name }) {
  if (name === 'windows') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 5.548l7.055-1.02v6.835H3V5.548zm0 7.255h7.055v6.853L3 18.637v-5.834zm8.098 6.853l9.902 1.443V12.5h-9.902v6.156zm0-13.707L21 1.5v6.156h-9.902V5.949z" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function DocsDownloadCards() {
  return (
    <div className="my-6 rounded-xl border border-border bg-surface/40 p-4 sm:p-5">
      <div className="mb-4 text-sm text-muted">
        当前最新版本 <span className="font-semibold text-[rgb(var(--color-text))] tabular-nums">v{APP_VERSION}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {DOWNLOADS.map((d) => (
          <a
            key={d.id}
            href={d.href}
            download
            className="group rounded-lg border border-border bg-bg/60 px-4 py-3 transition-colors hover:border-accent/45"
            onClick={(e) => {
              e.preventDefault()
              reportDownloadThenGo(d.href, d.platform)
            }}
          >
            <div className="flex items-center gap-2 text-accent mb-1.5">
              <PlatformIcon name={d.icon} />
              <span className="font-medium text-sm">{d.title}</span>
            </div>
            <div className="text-xs text-muted">{d.subtitle}</div>
          </a>
        ))}
      </div>
    </div>
  )
}

const INLINE_COMPONENTS = {
  'chrome-extensions-ui': () => <ChromeExtensionsUI />,
  'download-cards': () => <DocsDownloadCards />,
  'supported-sites': () => <SupportedSites />,
}

// Process content: replace [[component:x]] and [[screenshot:x desc]] with React elements
function processContent(html) {
  // Split on component/screenshot markers
  const parts = html.split(/(\[\[(?:component|screenshot):[^\]]+\]\])/g)
  return parts.map((part, i) => {
    const compMatch = part.match(/^\[\[component:(\S+)\]\]$/)
    if (compMatch) {
      const Comp = INLINE_COMPONENTS[compMatch[1]]
      return Comp ? <Comp key={i} /> : null
    }
    const ssMatch = part.match(/^\[\[screenshot:(\S+)\s+(.+)\]\]$/)
    if (ssMatch) {
      return <ScreenshotPlaceholder key={i} label={ssMatch[2]} />
    }
    return <div key={i} className="prose-dark" dangerouslySetInnerHTML={{ __html: part }} />
  })
}

function DocsToc({ headings, activeId }) {
  if (!headings.length) return null

  const handleClick = (e, id) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="hidden xl:block w-40 flex-shrink-0 sticky top-20 self-start pt-6">
      <div className="text-[11px] font-semibold text-muted uppercase tracking-widest mb-3">
        本页目录
      </div>
      <nav>
        <ul className="space-y-0.5">
          {headings.map(h => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={e => handleClick(e, h.id)}
                className={`block text-[13px] leading-snug py-0.5 transition-colors ${
                  h.level === 3 ? 'pl-3' : ''
                } ${activeId === h.id ? 'text-accent' : 'text-muted hover:text-[rgb(var(--color-text))]'}`}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

// ─── Main Docs page ───────────────────────────────────────────────────────────

export default function Docs() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const activeSlug = slug || 'introduction'

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [headings, setHeadings] = useState([])
  const [activeId, setActiveId] = useState('')

  // Redirect /docs → /docs/introduction; legacy installation → quick-start
  useEffect(() => {
    if (!slug) {
      navigate('/docs/introduction', { replace: true })
      return
    }
    if (slug === 'installation') {
      navigate('/docs/quick-start', { replace: true })
    }
  }, [slug, navigate])

  // Ensure each docs page starts from top after route/menu switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeSlug])

  // Fetch markdown from public/docs/
  useEffect(() => {
    setLoading(true)
    setError(null)
    setHeadings([])
    setActiveId('')

    fetch(`/docs/${activeSlug}.md`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.text()
      })
      .then(md => {
        const normalized = normalizeMarkdown(md)
        setContent(normalized)
        const mdHeadings = extractHeadings(normalized)
        setHeadings(
          activeSlug === 'supported-sites'
            ? [...getSupportedSitesHeadings(), ...mdHeadings]
            : activeSlug === 'wecli'
              ? getWecliHeadings()
              : mdHeadings
        )
        setLoading(false)
      })
      .catch(() => {
        setError('文档未找到')
        setLoading(false)
      })
  }, [activeSlug])

  // Track active heading on scroll
  useEffect(() => {
    if (!headings.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) { setActiveId(entry.target.id); break }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )
    headings.forEach(h => {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings, content])

  // Add copy buttons to code blocks
  useEffect(() => {
    if (loading || error) return

    const addCopyBtn = (pre) => {
      if (pre.querySelector('.copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.title = '复制'
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')
        if (!code) return
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
          btn.classList.add('copied')
          setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
            btn.classList.remove('copied')
          }, 1500)
        })
      })
      pre.style.position = 'relative'
      pre.appendChild(btn)
    }

    // Process existing pre elements
    const timer = setTimeout(() => {
      document.querySelectorAll('.prose-dark pre').forEach(addCopyBtn)
    }, 50)

    // Watch for new pre elements added later
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue
          if (node.tagName === 'PRE') addCopyBtn(node)
          node.querySelectorAll?.('pre').forEach(addCopyBtn)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => { clearTimeout(timer); observer.disconnect() }
  }, [content, loading, error])

  // Find prev/next（跳过外链菜单项）
  const allItems = DOCS_SIDEBAR.flatMap(g => g.items).filter(i => i.slug && !i.href)
  const idx = allItems.findIndex(i => i.slug === activeSlug)
  const prev = idx > 0 ? allItems[idx - 1] : null
  const next = idx < allItems.length - 1 ? allItems[idx + 1] : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20">
      <ImageLightbox />
      <div className="flex gap-10">
        <DocsSidebar />

        <article className="flex-1 min-w-0">
          {loading && (
            <div className="text-muted text-sm py-20 text-center">加载中...</div>
          )}
          {error && (
            <div className="text-red-400 text-sm py-20 text-center">{error}</div>
          )}
          {!loading && !error && (
            <div>
              {processContent(renderMarkdown(content))}
            </div>
          )}

          {/* Prev / Next */}
          <div className="mt-12 pt-6 border-t border-border flex justify-between gap-4">
            {prev ? (
              <a href={`/docs/${prev.slug}`} className="flex items-center gap-2 text-sm text-muted hover:text-[rgb(var(--color-text))] transition-colors group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:-translate-x-0.5 transition-transform">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                {prev.title}
              </a>
            ) : <div />}
            {next ? (
              <a href={`/docs/${next.slug}`} className="flex items-center gap-2 text-sm text-muted hover:text-[rgb(var(--color-text))] transition-colors group ml-auto">
                {next.title}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-0.5 transition-transform">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            ) : <div />}
          </div>
        </article>

        <DocsToc headings={headings} activeId={activeId} />
      </div>
    </div>
  )
}
