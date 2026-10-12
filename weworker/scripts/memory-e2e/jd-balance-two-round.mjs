#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  BASE,
  bootstrapUiEnv,
  connectWeWorkerPage,
  disableProxy,
  getAuthToken,
  logLive,
  readLastAssistantReply,
  readMemoryBanner,
  readVisibleToolSteps,
  sleep,
  subscribeEvents,
} from './ui-lib.mjs'

const prompt = process.env.JD_MEMORY_TEST_PROMPT
  || '请打开京东，查看我的账户余额。只读查询，不要下单、不要支付、不要修改任何内容。请真实执行，不要编造结果。'
const memoryDbFile = path.join(os.homedir(), '.weworker', 'memory.db')
const worksDbFile = path.join(os.homedir(), '.weworker', 'works.db')
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

function snapshotMemoryDb() {
  const db = new DatabaseSync(memoryDbFile, { readOnly: true })
  try {
    return {
      active: db.prepare("SELECT id,type,key,status,site_scope,updated_at,substr(content,1,200) AS content_preview FROM memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT 50").all(),
      events: db.prepare('SELECT event_id,status,attempts,updated_at FROM memory_events ORDER BY updated_at DESC LIMIT 50').all(),
    }
  } finally {
    db.close()
  }
}

function diffMemory(before, after) {
  const beforeIds = new Set(before.active.map((row) => row.id))
  return {
    added: after.active.filter((row) => !beforeIds.has(row.id)),
    updated: after.active.filter((row) => {
      const previous = before.active.find((rowBefore) => rowBefore.id === row.id)
      return previous && previous.updated_at !== row.updated_at
    }),
  }
}

function snapshotLatestWorkIds() {
  const db = new DatabaseSync(worksDbFile, { readOnly: true })
  try {
    return new Set(db.prepare('SELECT id FROM works ORDER BY updated_at DESC LIMIT 20').all().map((row) => row.id))
  } finally {
    db.close()
  }
}

function readCompletedWork(beforeIds) {
  const db = new DatabaseSync(worksDbFile, { readOnly: true })
  try {
    const works = db.prepare('SELECT id,updated_at FROM works ORDER BY updated_at DESC LIMIT 20').all()
    for (const work of works) {
      if (beforeIds.has(work.id)) continue
      const messages = db.prepare('SELECT role,content,created_at FROM messages WHERE work_id = ? ORDER BY created_at ASC').all(work.id)
      const assistant = messages.findLast((message) => message.role === 'assistant')
      if (!assistant) continue
      return { workId: work.id, messages }
    }
    return null
  } finally {
    db.close()
  }
}

async function waitForCompletedWork(beforeIds, timeoutMs = 420000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const completed = readCompletedWork(beforeIds)
    if (completed) return completed
    await sleep(1000)
  }
  throw new Error('等待 works.db 中的助手回复 timeout')
}

async function waitForState(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      body: document.body.innerText || '',
      inputDisabled: !!document.querySelector('textarea[data-weworker-chat-input="true"]')?.disabled,
      hasStop: !!document.querySelector('button.chat-input-action-stop'),
      hasAssistant: document.querySelectorAll('.message-item--assistant').length > 0,
    }))
    if (predicate(state)) return state
    await sleep(500)
  }
  throw new Error(`${label} timeout`)
}

async function clickNewWork(page) {
  await waitForState(page, (state) => !state.hasStop && !state.inputDisabled, 30000, '等待 UI 空闲')
  const result = await page.evaluate(() => {
    const button = document.querySelector('button[data-weworker-new-work="true"]')
    if (!button) return { ok: false, reason: 'button_not_found' }
    button.click()
    return { ok: true }
  })
  if (!result.ok) throw new Error(`新任务按钮不可用: ${result.reason}`)
  await sleep(1500)
  await waitForState(page, (state) => state.body.includes('像聊天一样操作网站') && !state.hasStop, 30000, '等待新会话')
}

async function sendViaDom(page, text, beforeIds) {
  const input = await page.$('textarea[data-weworker-chat-input="true"]')
  if (!input) throw new Error('DOM 发送失败: input_not_found')
  await input.focus()
  await page.keyboard.type(text)
  await page.waitForFunction(() => {
    const button = document.querySelector('button.chat-input-action-send')
    return Boolean(button && !button.disabled)
  }, { timeout: 30000 })
  await page.click('button.chat-input-action-send')
  await waitForState(page, (state) => state.hasStop || state.hasAssistant, 30000, '等待聊天开始')
  await waitForState(page, (state) => !state.hasStop && state.hasAssistant, 420000, '等待助手回复')
  const completedWork = await waitForCompletedWork(beforeIds, 30000)
  await sleep(12000)
  return completedWork
}

async function main() {
  disableProxy()
  fs.mkdirSync(outDir, { recursive: true })
  await bootstrapUiEnv({ reuse: false })
  const { page, browser } = await connectWeWorkerPage()
  const token = await getAuthToken(page)
  const memoryEvents = []
  const stopEvents = await subscribeEvents((event) => {
    if (event?.type?.startsWith('memory_')) memoryEvents.push(event)
  }, token)

  await page.evaluate(() => {
    window.__jdBalanceChatEvents = []
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
      if (url.includes('/chat') && response.ok) {
        response.clone().text().then((text) => {
          for (const chunk of text.split('\n\n')) {
            const line = chunk.split('\n').find((value) => value.startsWith('data: '))
            if (!line) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue
            try { window.__jdBalanceChatEvents.push(JSON.parse(raw)) } catch {}
          }
        }).catch(() => {})
      }
      return response
    }
  })

  const statusResponse = await fetch(`${BASE}/status`, { headers: { 'X-WeWorker-Auth': token } })
  const status = await statusResponse.json()
  const rounds = []
  for (let round = 1; round <= 2; round += 1) {
    const before = snapshotMemoryDb()
    const beforeWorkIds = snapshotLatestWorkIds()
    const eventStart = memoryEvents.length
    await clickNewWork(page)
    logLive('chat', `第 ${round} 轮 DOM 发送`, prompt)
    const completedWork = await sendViaDom(page, prompt, beforeWorkIds)
    const after = snapshotMemoryDb()
    const chatEvents = await page.evaluate(() => window.__jdBalanceChatEvents.splice(0))
    const record = {
      round,
      workId: completedWork.workId,
      assistantReply: await readLastAssistantReply(page),
      banner: await readMemoryBanner(page),
      tools: await readVisibleToolSteps(page),
      chatEvents: chatEvents.filter((event) => ['context_snapshot', 'memory_parse', 'memory_candidate', 'memory_status', 'turn_end', 'error'].includes(event.type)),
      broadcastMemoryEvents: memoryEvents.slice(eventStart),
      dbDiff: diffMemory(before, after),
      dbAfter: after,
    }
    rounds.push(record)
    logLive('result', {
      round,
      dbAdded: record.dbDiff.added.map((row) => `${row.type}:${row.key}`),
      dbUpdated: record.dbDiff.updated.map((row) => `${row.type}:${row.key}`),
      memoryStatuses: record.broadcastMemoryEvents.map((event) => event.status),
      chatEvents: record.chatEvents.map((event) => event.type),
      replyTail: record.assistantReply.slice(-500),
    })
    await sleep(5000)
  }

  stopEvents()
  const file = path.join(outDir, `jd-balance-two-round-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), status, prompt, rounds }, null, 2))
  console.log(`RESULT_FILE ${file}`)
  await browser.disconnect()
  process.exit(0)
}

main().catch((error) => {
  console.error('[jd-balance-e2e] fatal', error)
  process.exit(1)
})
