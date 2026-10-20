// Adapter 调用统计 —— 数据层
// 走同域 /api/stats：本地 dev 由 Vite proxy 转发到 metrics-server，生产由 Nginx 反代。
// token 在代理层注入，不进前端 bundle。
// 一次请求 by=tool 拿全量 tool 明细，前端按 domain 分组：
//   - adapter 汇总 calls = 各 tool calls 之和（精确）
//   - adapter 汇总 okRate = 按 calls 加权（精确）
//   - adapter 汇总 p50/p95 = 各 tool p50/p95 按 calls 加权平均（近似，看板够用）

/**
 * 从完整工具名提取 domain（最后一个 '.' 之前）。
 * mail.example.com.search_messages → mail.example.com
 * open_browser（无点）→ open_browser
 */
export function domainOf(tool) {
  const i = String(tool).lastIndexOf('.')
  return i > 0 ? tool.slice(0, i) : tool
}

/**
 * 请求 stats。走同域 /api/stats（Vite proxy / Nginx 注入 token）。
 * @param {{by?:string, since?:string, kind?:string, top?:number}} opts
 * @returns {Promise<{rows:Array, totalCalls:number}>}
 */
export async function fetchStats({ by = 'tool', since = '7d', kind = 'adapter', top = null } = {}) {
  const params = new URLSearchParams({ by, since, kind })
  if (top) params.set('top', String(top))
  const res = await fetch(`/api/stats?${params}`)
  if (!res.ok) throw new Error(`stats 请求失败: ${res.status}`)
  if (!res.headers.get('content-type')?.includes('application/json')) {
    return { rows: [], totalCalls: 0, unavailable: true }
  }
  return res.json()
}

/**
 * 把 by=tool 的明细分组为 adapter（domain）汇总。
 * @param {Array<{key:string, calls:number, okRate:number, p50:number, p95:number}>} toolRows
 * @returns {Array<{domain:string, calls:number, okRate:number, p50:number, p95:number, tools:Array}>}
 */
export function groupByDomain(toolRows) {
  const map = new Map()
  for (const r of toolRows) {
    const d = domainOf(r.key)
    if (!map.has(d)) {
      map.set(d, { domain: d, calls: 0, okSum: 0, p50Sum: 0, p95Sum: 0, tools: [] })
    }
    const g = map.get(d)
    const calls = Number(r.calls) || 0
    g.calls += calls
    g.okSum += calls * (Number(r.okRate) || 0)
    g.p50Sum += calls * (Number(r.p50) || 0)
    g.p95Sum += calls * (Number(r.p95) || 0)
    g.tools.push({
      tool: r.key,
      calls,
      okRate: Number(r.okRate) || 0,
      p50: Number(r.p50) || 0,
      p95: Number(r.p95) || 0,
    })
  }

  const result = [...map.values()].map((g) => {
    const calls = g.calls
    const tools = g.tools.sort((a, b) => b.calls - a.calls)
    return {
      domain: g.domain,
      calls,
      okRate: calls ? +(g.okSum / calls).toFixed(1) : 0,
      p50: calls ? Math.round(g.p50Sum / calls) : 0,
      p95: calls ? Math.round(g.p95Sum / calls) : 0,
      tools,
    }
  })
  result.sort((a, b) => b.calls - a.calls)
  return result
}

/**
 * 把 by=user 的扁平 rows 按 user 分组。
 * @param {Array<{user:string, domain:string, calls:number}>} rows
 * @returns {Array<{user:string, calls:number, domains:Array<{domain:string, calls:number}>}>}
 */
export function groupByUser(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!r.user) continue
    if (!map.has(r.user)) {
      map.set(r.user, { user: r.user, calls: 0, domains: [] })
    }
    const g = map.get(r.user)
    g.calls += Number(r.calls) || 0
    g.domains.push({ domain: r.domain, calls: Number(r.calls) || 0 })
  }
  const result = [...map.values()].map((g) => ({
    user: g.user,
    calls: g.calls,
    domains: g.domains.sort((a, b) => b.calls - a.calls),
  }))
  result.sort((a, b) => b.calls - a.calls)
  return result
}
