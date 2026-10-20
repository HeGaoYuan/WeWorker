import { Link, useParams } from 'react-router-dom'
import { DOCS_SIDEBAR } from '../lib/docsConfig.js'

export default function DocsSidebar() {
  const { slug } = useParams()
  const activeSlug = slug || 'introduction'

  return (
    <nav className="w-64 flex-shrink-0 pr-4">
      <div className="sticky top-20 space-y-6 border-r border-border/60 pr-3">
        {DOCS_SIDEBAR.map((group) => (
          <div key={group.group}>
            <div className="mb-2 px-3">
              <div className="inline-flex items-center rounded-md border border-accent/35 bg-accent/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent">
                {group.group}
              </div>
            </div>
            <ul className="space-y-0.5 border-l border-border/80 ml-3 pl-2">
              {group.items.map((item) => {
                const key = item.slug || item.href || item.title
                const className = `block px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                  item.slug && activeSlug === item.slug
                    ? 'bg-accent/15 text-accent font-semibold border border-accent/45'
                    : 'text-muted hover:text-[rgb(var(--color-text))] hover:bg-surface'
                }`

                if (item.href) {
                  return (
                    <li key={key}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={className}
                      >
                        {item.title}
                      </a>
                    </li>
                  )
                }

                return (
                  <li key={key}>
                    <Link to={`/docs/${item.slug}`} className={className}>
                      {item.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
