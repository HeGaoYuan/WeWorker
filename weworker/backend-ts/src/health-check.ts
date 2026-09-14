/**
 * Adapter Health Check — 从 work 消息中分析工具调用情况。
 *
 * 健康检查通过普通 AI 对话执行（复用 /works/:id/chat），
 * 这里负责从对话消息中提取工具调用汇总并持久化结果。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as store from './works-store.js'
import { parseAllAdapters } from './adapter-parser.js'

const RESULTS_FILE = path.join(os.homedir(), '.weworker', 'health-check.json')

export interface ToolResult {
  status: 'pass' | 'fail' | 'uncovered'
  args?: string
  result?: string
}

export interface SiteCheckResult {
  tools: Record<string, ToolResult>
  workId: string
}

export interface HealthCheckResults {
  lastRun: string
  results: Record<string, SiteCheckResult>
}

/**
 * Analyze a work's messages to extract tool call results for a specific adapter.
 */
export function analyzeWorkTools(workId: string, siteId: string): Record<string, ToolResult> {
  const work = store.getWorkWithMessages(workId)
  if (!work) return {}

  const adapter = parseAllAdapters().get(siteId)
  if (!adapter) return {}

  const allToolNames = new Set(adapter.tools.map(t => t.name))
  const toolResults: Record<string, ToolResult> = {}

  // Build a lookup map: various name formats → canonical tool name
  // Handles both new format (- for dots) and legacy format (__ or _ for dots)
  const nameMap = new Map<string, string>()
  for (const name of allToolNames) {
    nameMap.set(name, name)                                    // jd.com.view_orders (original)
    nameMap.set(name.replace(/\./g, '-'), name)                // jd-com-view_orders (new sanitized)
    nameMap.set(name.replace(/\./g, '_'), name)                // jd_com_view_orders (SDK mangled)
    nameMap.set(name.replace(/\./g, '__'), name)               // jd__com__view_orders (old sanitized)
  }

  function resolveToolName(raw: string): string | null {
    // Strip MCP prefix variants
    let name = raw.replace(/^mcp__weworker__/, '').replace(/^mcp\.weworker\./, '')
    // Try direct match
    if (nameMap.has(name)) return nameMap.get(name)!
    // Try converting - to . (new format)
    const dashed = name.replace(/-/g, '.')
    if (nameMap.has(dashed)) return nameMap.get(dashed)!
    // Try converting __ to . (old format)
    const doubled = name.replace(/__/g, '.')
    if (nameMap.has(doubled)) return nameMap.get(doubled)!
    return null
  }

  for (const msg of work.messages) {
    if (msg.role !== 'assistant') continue
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue
      const tb = block as { name: string; args?: unknown; result?: string }
      let name = tb.name || ''
      // Strip MCP prefix variants and resolve to canonical adapter tool name
      const canonical = resolveToolName(name)
      // Also handle non-adapter tools like open_browser
      const resolvedName = canonical || name.replace(/^mcp__weworker__/, '').replace(/^mcp\.weworker\./, '').replace(/__/g, '.')
      if (!resolvedName) continue

      const argsStr = tb.args ? JSON.stringify(tb.args).slice(0, 500) : ''
      const resultStr = (tb.result ?? '').slice(0, 500)

      let isError = false
      try {
        const parsed = JSON.parse(resultStr)
        isError = parsed && typeof parsed === 'object' && 'error' in parsed
      } catch {}

      // Keep the worst result (fail > pass)
      const existing = toolResults[name]
      if (!existing || isError) {
        toolResults[name] = {
          status: isError ? 'fail' : 'pass',
          args: argsStr,
          result: resultStr,
        }
      }
    }
  }

  for (const name of allToolNames) {
    if (!toolResults[name]) {
      toolResults[name] = { status: 'uncovered' }
    }
  }

  return toolResults
}

export function saveResults(results: HealthCheckResults): void {
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true })
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
}

export function loadResults(): HealthCheckResults | null {
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    return null
  }
}
