// 报告输出：每用例 JSONL 逐事件明细 + summary.md 汇总 + cases.json 机读。
import fs from 'node:fs'
import path from 'node:path'

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

const fmtMs = (ms) => ms == null ? '-' : `${Math.round(ms)}ms`
const fmtTok = (n) => n == null ? '-' : String(n)
const pct = (x) => x == null ? '-' : `${(x * 100).toFixed(1)}%`
const money = (x) => x == null ? '-' : `$${Number(x).toFixed(5)}`
function truncate(s, n = 30) {
  s = String(s || '').replace(/[\r\n|]/g, ' ')
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function formatAssertions(a) {
  if (!a || !Object.keys(a).length) return '-'
  const parts = []
  if (a.expectToolsOk != null) {
    parts.push(a.expectToolsOk ? '✓tools' : `✗tools(${(a.expectToolsMissed || []).join(';')})`)
  }
  if (a.maxMsOk != null) parts.push(a.maxMsOk ? '✓ms' : `✗ms(>${a.expectMaxMs})`)
  return parts.join(' ') || '-'
}

/**
 * @param {object} opts
 * @param {string} opts.outDir
 * @param {string} opts.runTs
 * @param {object[]} opts.results  CaseResult[]（含 trace）
 * @returns {{runDir:string, summaryPath:string}}
 */
export function writeReport({ outDir, runTs, results }) {
  const runDir = path.join(outDir, runTs)
  const casesDir = path.join(runDir, 'cases')
  ensureDir(casesDir)

  // 1) 每用例逐事件 JSONL 明细
  for (const r of results) {
    const safeId = String(r.id).replace(/[^\w.-]/g, '_')
    const f = path.join(casesDir, `${safeId}.jsonl`)
    const lines = (r.trace || []).map(ev => JSON.stringify(ev))
    fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8')
  }

  // 2) cases.json（去掉 trace，trace 已在 jsonl；保留 steps/timing/usage）
  const slim = results.map(({ trace, ...rest }) => rest)
  fs.writeFileSync(path.join(runDir, 'cases.json'), JSON.stringify(slim, null, 2), 'utf8')

  // 3) summary.md
  const ok = results.filter(r => r.status === 'ok')
  const bad = results.filter(r => r.status !== 'ok')
  const totalMs = results.reduce((s, r) => s + (r.timing?.totalMs ?? r.wallMs ?? 0), 0)
  const totalIn = results.reduce((s, r) => s + (r.usage?.total_input_tokens ?? r.usage?.total_in ?? 0), 0)
  const totalOut = results.reduce((s, r) => s + (r.usage?.output_tokens ?? r.usage?.output ?? 0), 0)
  const totalCost = results.reduce((s, r) => s + (r.usage?.total_cost_usd ?? r.usage?.cost ?? 0), 0)
  const hitVals = results.map(r => r.usage?.cache_hit_rate ?? r.usage?.cache_hit).filter(v => v != null)
  const avgHit = hitVals.length ? hitVals.reduce((a, b) => a + b, 0) / hitVals.length : null

  const sorted = [...results].sort(
    (a, b) => (b.timing?.totalMs ?? b.wallMs ?? 0) - (a.timing?.totalMs ?? a.wallMs ?? 0)
  )

  const md = []
  md.push('# Chat Bench 报告')
  md.push('')
  md.push(`- 运行时间: ${runTs}`)
  md.push(`- 用例数: ${results.length}（ok ${ok.length} / 异常 ${bad.length}）`)
  md.push(`- 对话总耗时(sum totalMs): ${(totalMs / 1000).toFixed(1)}s`)
  md.push(`- token: in ${totalIn.toLocaleString()} / out ${totalOut.toLocaleString()}`)
  md.push(`- 总 cost: ${money(totalCost)}　平均 cache_hit: ${pct(avgHit)}`)
  md.push('')
  md.push('## 用例明细（按 totalMs 降序）')
  md.push('')
  md.push('| id | prompt | status | totalMs | llmMs | execMs | steps | in/out | cache_hit | cost | 断言 |')
  md.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of sorted) {
    const u = r.usage || {}
    const t = r.timing || {}
    const inTok = u.total_input_tokens ?? u.total_in ?? u.input_tokens ?? u.input
    const outTok = u.output_tokens ?? u.output
    md.push(
      `| ${r.id} | ${truncate(r.prompt, 30)} | ${r.status} | ${fmtMs(t.totalMs)} | ${fmtMs(t.llmMs)} | ${fmtMs(t.execMs)} | ${t.steps ?? r.stepCount ?? '-'} | ${fmtTok(inTok)}/${fmtTok(outTok)} | ${pct(u.cache_hit_rate ?? u.cache_hit)} | ${money(u.total_cost_usd ?? u.cost)} | ${formatAssertions(r.assertions)} |`,
    )
  }
  md.push('')

  if (bad.length) {
    md.push('## 异常 / 超时用例')
    md.push('')
    for (const r of bad) {
      md.push(`### ${r.id} — \`${r.status}\``)
      md.push(`- prompt: ${r.prompt}`)
      if (r.error) md.push(`- error: ${truncate(r.error, 200)}`)
      md.push('')
    }
  }

  // 按 site 汇总（多为 test-prompts 来源）
  const bySite = {}
  for (const r of results) {
    if (!r.siteId) continue
    ;(bySite[r.siteId] ||= []).push(r)
  }
  if (Object.keys(bySite).length) {
    md.push('## 按 site 汇总')
    md.push('')
    md.push('| siteId | 用例数 | ok | 平均 totalMs | 平均 cache_hit |')
    md.push('|---|---|---|---|---|')
    for (const [site, rs] of Object.entries(bySite)) {
      const o = rs.filter(r => r.status === 'ok').length
      const avg = rs.reduce((s, r) => s + (r.timing?.totalMs ?? 0), 0) / rs.length
      const hv = rs.map(r => r.usage?.cache_hit_rate ?? r.usage?.cache_hit).filter(v => v != null)
      const avgH = hv.length ? hv.reduce((a, b) => a + b, 0) / hv.length : null
      md.push(`| ${site} | ${rs.length} | ${o} | ${fmtMs(avg)} | ${pct(avgH)} |`)
    }
    md.push('')
  }

  md.push('## 明细')
  md.push('- 每用例逐 SSE 事件（含 think/exec/usage）：`cases/<id>.jsonl`')
  md.push('- 全量机读结果（含 steps/timing/usage）：`cases.json`')
  fs.writeFileSync(path.join(runDir, 'summary.md'), md.join('\n'), 'utf8')

  return { runDir, summaryPath: path.join(runDir, 'summary.md') }
}
