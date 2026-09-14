// 用例装配：合并 GET /health-check/test-prompts（server.ts:1688）与自定义 JSON/CSV 用例。
// 纯函数 + 文件读取，不持有网络状态（test-prompts 通过传入的 client 拉取）。
import fs from 'node:fs'

/** 最小 CSV 解析：支持双引号、引号内逗号、"" 转义。 */
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function parseCsvCases(raw) {
  const rows = parseCsv(raw.trim())
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  const idx = (name) => header.findIndex(h => h === name)
  const pi = idx('prompt')
  if (pi < 0) throw new Error('CSV 缺少 prompt 列（首行需含 id,prompt,...）')
  const ii = idx('id'), si = idx('siteid'), ci = idx('category'),
    ei = idx('expecttools'), mi = idx('expectmaxms')
  return rows.slice(1)
    .filter(r => (r[pi] || '').trim())
    .map((r, i) => ({
      id: (ii >= 0 && (r[ii] || '').trim()) || `csv-${i + 1}`,
      prompt: r[pi].trim(),
      siteId: si >= 0 && (r[si] || '').trim() ? r[si].trim() : undefined,
      category: ci >= 0 && (r[ci] || '').trim() ? r[ci].trim() : undefined,
      expectTools: ei >= 0 && (r[ei] || '').trim()
        ? r[ei].split(';').map(s => s.trim()).filter(Boolean) : undefined,
      expectMaxMs: mi >= 0 && (r[mi] || '').trim() ? Number(r[mi]) : undefined,
    }))
}

function normalizeCase(c, fallbackId, source) {
  const obj = typeof c === 'string' ? { prompt: c } : c
  const prompt = (obj.prompt || obj.message || '').toString()
  if (!prompt.trim()) return null
  const expectTools = Array.isArray(obj.expectTools)
    ? obj.expectTools
    : (obj.expectTools ? [obj.expectTools] : undefined)
  return {
    id: obj.id || fallbackId,
    prompt,
    siteId: obj.siteId || obj.site || undefined,
    category: obj.category || undefined,
    expectTools: expectTools && expectTools.length ? expectTools : undefined,
    expectMaxMs: obj.expectMaxMs != null ? Number(obj.expectMaxMs) : undefined,
    availableTools: obj.availableTools || undefined,
    source,
  }
}

/** 读取自定义用例文件（.json 数组 或 .csv）。 */
export function loadCustomCases(path) {
  if (!path) return []
  const raw = fs.readFileSync(path, 'utf8')
  let list
  if (path.toLowerCase().endsWith('.csv')) {
    list = parseCsvCases(raw)
  } else {
    list = JSON.parse(raw)
  }
  if (!Array.isArray(list)) throw new Error(`用例文件 ${path} 必须是数组`)
  return list
    .map((c, i) => normalizeCase(c, `custom-${i + 1}`, 'custom'))
    .filter(Boolean)
}

/** 拉取后端 test-prompts 并转成 CaseDef（按 --sites 过滤）。不设 expectTools（仅参考）。 */
export async function fetchTestPrompts(client, sitesFilter) {
  const prompts = await client.testPrompts()
  const filter = sitesFilter ? new Set(sitesFilter.split(',').map(s => s.trim()).filter(Boolean)) : null
  return prompts
    .filter(p => !filter || filter.has(p.siteId))
    .map((p, i) => normalizeCase({
      id: `tp-${p.siteId}-${i + 1}`,
      prompt: p.prompt,
      siteId: p.siteId,
      category: `test-prompt/${p.siteName}`,
      availableTools: p.toolNames,
    }, `tp-${p.siteId}-${i + 1}`, 'test-prompts'))
}

/**
 * 合并 + 按 prompt 文本去重（自定义优先于 test-prompts）。
 * @param {{custom?:object[], testPrompts?:object[], promptsOnly?:boolean}} opts
 */
export function assembleCases({ custom, testPrompts, promptsOnly }) {
  const merged = promptsOnly
    ? [...(testPrompts || [])]
    : [...(custom || []), ...(testPrompts || [])]
  const seen = new Set()
  const out = []
  for (const c of merged) {
    const key = c.prompt.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
