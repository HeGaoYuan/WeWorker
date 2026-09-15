import sitesData from '../lib/sites.generated.json'
import { slugify } from '../lib/sitesHeadings.js'

function renderInlineCode(text) {
  return String(text).split(/(`[^`]+`)/g).map((part, index) => (
    part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? <code key={index}>{part.slice(1, -1)}</code>
      : part
  ))
}

function pairExamples(prompts = [], commands = []) {
  const length = Math.max(prompts.length, commands.length)
  return Array.from({ length }, (_, index) => ({
    prompt: prompts[index] || null,
    command: commands[index] || null,
  }))
}

function ExampleCard({ prompt, command }) {
  if (prompt && !command) return <pre><code>{prompt}</code></pre>
  if (!prompt && command) {
    return (
      <div className="site-example-card">
        <div className="site-example-card__label">webcli写法示例</div>
        <pre className="site-example-card__pre"><code>{command}</code></pre>
      </div>
    )
  }
  return (
    <div className="site-example-card">
      <pre className="site-example-card__pre site-example-card__prompt"><code>{prompt}</code></pre>
      <div className="site-example-card__label">webcli写法示例</div>
      <pre className="site-example-card__pre"><code>{command}</code></pre>
    </div>
  )
}

function SiteSection({ site }) {
  const examples = pairExamples(site.prompts, site.commands)
  return (
    <div>
      <h3 id={slugify(site.name)}>
        {site.name}
        {site.api_first ? <span className="ml-2 align-middle text-xs font-normal text-muted">WeCLI · API-first</span> : null}
      </h3>
      {site.summary ? <p>{renderInlineCode(site.summary)}</p> : null}
      {!site.api_first && site.features?.length ? <p>{site.features.join('、')}</p> : null}
      {site.capabilities?.length ? (
        <>
          <p>子能力：</p>
          <ul>{site.capabilities.map((capability) => <li key={capability}>{renderInlineCode(capability)}</li>)}</ul>
        </>
      ) : null}
      {examples.length ? (
        <>
          <p>试试说：</p>
          {examples.map((example, index) => <ExampleCard key={`${site.id}-ex-${index}`} {...example} />)}
        </>
      ) : null}
    </div>
  )
}

export default function SupportedSites() {
  return (
    <div className="prose-dark">
      {sitesData.groups.map((group) => (
        <section key={group.name}>
          <h2 id={slugify(group.name)}>{group.name}</h2>
          {group.sites.map((site) => <SiteSection key={site.id} site={site} />)}
        </section>
      ))}
    </div>
  )
}
