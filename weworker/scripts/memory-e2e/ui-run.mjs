#!/usr/bin/env node
/**
 * 长期记忆真实 UI E2E — 编排入口。
 * 环境/ DOM 能力见 ui-lib.mjs；本文件只定义场景与判定。
 *
 * Usage:
 *   node scripts/memory-e2e/ui-run.mjs [--reuse] [--scenario T9|C2+T11|ALL]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  BASE,
  CDP_URL,
  bootstrapUiEnv,
  connectWeWorkerPage,
  createNewWork,
  disableProxy,
  getAuthToken,
  sendChatViaDom,
  subscribeEvents,
  logLive,
} from './ui-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEMORY_DB = path.join(os.homedir(), '.weworker', 'memory.db')
const OUT_DIR = path.join(__dirname, 'out')

const args = process.argv.slice(2)
const reuseEnv = args.includes('--reuse')
const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1]
  || (args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : 'ALL')

function snapshotMemoryDb() {
  if (!fs.existsSync(MEMORY_DB)) return { exists: false, active: [], events: [] }
  const db = new DatabaseSync(MEMORY_DB, { readOnly: true })
  try {
    return {
      exists: true,
      active: db.prepare(
        "SELECT id, type, key, status, site_scope, updated_at FROM memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT 20",
      ).all(),
      events: db.prepare(
        'SELECT event_id, status, attempts, updated_at FROM memory_events ORDER BY updated_at DESC LIMIT 20',
      ).all(),
    }
  } finally {
    db.close()
  }
}

function diffMemory(before, after) {
  const beforeIds = new Set((before.active || []).map((r) => r.id))
  const added = (after.active || []).filter((r) => !beforeIds.has(r.id))
  const beforeEventIds = new Set((before.events || []).map((r) => r.event_id))
  const newEvents = (after.events || []).filter((r) => !beforeEventIds.has(r.event_id))
  return { added, newEvents }
}

const SCENARIOS = {
  T9: {
    id: 'T9',
    name: '任务成功经验（PowerShell UI）',
    prompt: '请用 PowerShell 执行 Write-Output "memory-success-check-ui-20260827"，确认真实返回成功，不要修改文件。',
    needsNewWork: true,
    async run(ctx) {
      const beforeDb = snapshotMemoryDb()
      const { banner, assistantText } = await sendChatViaDom(ctx.page, this.prompt, {
        turnTimeoutMs: 180000,
        postDelayMs: 8000,
      })
      const afterDb = snapshotMemoryDb()
      const dbDiff = diffMemory(beforeDb, afterDb)
      const memSaved = banner.includes('长期记忆已更新')
        || dbDiff.added.some((r) => r.type === 'task_execution')
      return {
        id: 'T9',
        name: this.name,
        banner,
        dbDiff,
        memoryStatuses: ctx.memoryEvents.filter((e) => e.type === 'memory_status'),
        assistantPreview: assistantText.slice(-1500),
        judgment: {
          verdict: memSaved ? '通过' : '未通过',
          memSaved,
          uiBanner: banner,
          dbAdded: dbDiff.added.length,
        },
      }
    },
  },
  'C2+T11': {
    id: 'C2+T11',
    name: '任务失败与恢复（同会话 UI）',
    needsNewWork: true,
    steps: [
      {
        id: 'C2',
        prompt: '请用 PowerShell 执行一个不存在的命令 memory_missing_command_for_test_20260827，记录失败原因，但不要修改任何文件。',
      },
      {
        id: 'T11',
        prompt: '继续处理刚才的任务，改用 Write-Output "memory-recovered-check-20260827" 验证恢复，不要重新创建任务。',
      },
    ],
    async run(ctx) {
      const beforeDb = snapshotMemoryDb()
      const stepResults = []
      for (const step of this.steps) {
        console.log(`[ui-e2e] --- ${step.id}`)
        const out = await sendChatViaDom(ctx.page, step.prompt, {
          turnTimeoutMs: 180000,
          postDelayMs: 8000,
        })
        stepResults.push({ id: step.id, banner: out.banner })
      }
      const afterDb = snapshotMemoryDb()
      const dbDiff = diffMemory(beforeDb, afterDb)
      const taskAdded = dbDiff.added.filter((r) => r.type === 'task_execution')
      const memSaved = taskAdded.length > 0 || ctx.memoryEvents.some((e) => e.status === 'saved')
      return {
        id: 'C2+T11',
        name: this.name,
        steps: stepResults,
        dbDiff,
        memoryStatuses: ctx.memoryEvents.filter((e) => e.type === 'memory_status'),
        judgment: {
          verdict: memSaved ? '部分通过' : '未通过',
          memSaved,
          taskOps: taskAdded.length,
          recoveredEvents: ctx.memoryEvents.filter((e) => e.type === 'task_recovered').length,
        },
      }
    },
  },
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  disableProxy()

  await bootstrapUiEnv({ reuse: reuseEnv })

  const statusRes = await fetch(`${BASE}/status`).catch(() => null)
  const status = statusRes && (statusRes.ok || statusRes.status === 401)
    ? await statusRes.json().catch(() => ({}))
    : {}
  console.log('[ui-e2e] status:', JSON.stringify({
    http: statusRes?.status,
    bridge: status.bridge,
    extension: status.extension,
    extension_version: status.extension_version,
  }))

  const { page } = await connectWeWorkerPage()
  const token = await getAuthToken(page)
  const memoryEvents = []
  const stopSse = await subscribeEvents((evt) => {
    if (evt?.type === 'memory_status') memoryEvents.push(evt)
  }, token)

  const pick = scenarioArg === 'ALL' ? ['T9', 'C2+T11'] : [scenarioArg]
  const results = []

  for (const key of pick) {
    const scenario = SCENARIOS[key]
    if (!scenario) {
      console.warn(`[ui-e2e] 未知场景: ${key}`)
      continue
    }
    console.log(`\n[ui-e2e] >>> ${scenario.id} ${scenario.name}`)
    try {
      if (scenario.needsNewWork) {
        console.log('[ui-e2e] 新建会话')
        await createNewWork(page, { token })
      }
      const record = await scenario.run({ page, memoryEvents })
      results.push(record)
      console.log('[ui-e2e] verdict:', record.judgment?.verdict)
      console.log('[ui-e2e] ui banner:', record.banner?.join?.(',')
        || record.steps?.map((s) => `${s.id}:${s.banner.join('|') || '(none)'}`).join('; ')
        || '(none)')
      console.log('[ui-e2e] db added:', record.dbDiff?.added?.map((r) => `${r.type}:${r.key}`).join(',') || '(none)')
    } catch (e) {
      console.error('[ui-e2e] error:', e.message)
      results.push({ id: scenario.id, ok: false, error: e.message })
    }
  }

  stopSse()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(OUT_DIR, `memory-ui-e2e-${stamp}.json`)
  fs.writeFileSync(outFile, JSON.stringify({
    at: new Date().toISOString(),
    mode: 'ui-cdp',
    cdp: CDP_URL,
    base: BASE,
    status,
    results,
  }, null, 2))
  console.log(`\n[ui-e2e] 结果已写入 ${outFile}`)
  // puppeteer.connect 会挂住事件循环；显式退出，避免「已写完结果但仍 running 十几分钟」
  process.exit(results.some((r) => r.ok === false || r.judgment?.verdict === '未通过') ? 2 : 0)
}

main().catch((e) => {
  console.error('[ui-e2e] fatal:', e)
  process.exit(1)
})
