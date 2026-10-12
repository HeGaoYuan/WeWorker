import puppeteer from 'puppeteer-core'

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9223',
  defaultViewport: null,
  protocolTimeout: 0,
})
const pages = await browser.pages()
const page = pages.find((p) => p.url().includes('5173'))
  || pages.find((p) => !p.url().startsWith('devtools://'))
if (!page) throw new Error(`no page: ${pages.map((p) => p.url()).join(',')}`)

await page.waitForSelector('textarea[data-weworker-chat-input="true"]', { timeout: 60000 })
await new Promise((r) => setTimeout(r, 2500))

const info = await page.evaluate(async () => {
  const res = await fetch('http://127.0.0.1:8765/settings')
  const s = await res.json()
  const body = document.body.innerText
  return {
    api_active: s.active_provider,
    api_model: s.model,
    ui_has_deepseek: body.includes('deepseek'),
    ui_has_claude: body.includes('claude-sonnet-4-6'),
    body_snip: body.slice(0, 1200),
  }
})
console.log(JSON.stringify(info, null, 2))
process.exit(info.api_active === 'deepseek' && info.ui_has_deepseek && !info.ui_has_claude ? 0 : 2)
