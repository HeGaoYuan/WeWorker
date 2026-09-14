/**
 * WeChat (微信) channel — connects via iLink Bot API (long-poll).
 * Protocol extracted from @tencent-weixin/openclaw-weixin plugin.
 *
 * Flow:
 *   1. QR login → get bot_token
 *   2. Long-poll getUpdates → receive messages
 *   3. sendMessage with context_token → reply
 */
import crypto, { createCipheriv } from 'node:crypto'

import { getSettings } from '../config.js'
import { generateTitle, generateTitleWithLLM } from '../title-utils.js'
import * as store from '../works-store.js'
import { runChannelChat } from './channel-manager.js'
import { CHANNEL_MYID_HINT, CHANNEL_EMPTY_REPLY_FALLBACK, getChannelPermissionMode } from './channel-permissions.js'
import { createLogger } from '../logger.js'

const log = createLogger('weixin')
import type { Channel, ChannelStatus } from './channel-manager.js'

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const MAX_MSG_LEN = 4000
const LONG_POLL_TIMEOUT_MS = 35_000
const API_TIMEOUT_MS = 15_000
const MAX_CONSECUTIVE_FAILURES = 3
const BACKOFF_DELAY_MS = 30_000
const RETRY_DELAY_MS = 2_000

// ── API helpers ───────────────────────────────────────────

function buildHeaders(token?: string, bodyLen?: number): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0)), 'utf-8').toString('base64'),
  }
  if (bodyLen != null) h['Content-Length'] = String(bodyLen)
  if (token?.trim()) h['Authorization'] = `Bearer ${token.trim()}`
  return h
}

async function apiFetch(baseUrl: string, endpoint: string, body: object, token?: string, timeoutMs = API_TIMEOUT_MS): Promise<unknown> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = new URL(endpoint, base)
  const bodyStr = JSON.stringify(body)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders(token, Buffer.byteLength(bodyStr, 'utf-8')),
      body: bodyStr,
      signal: controller.signal,
    })
    clearTimeout(timer)
    const text = await res.text()
    if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${text}`)
    return JSON.parse(text)
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

// ── Types ─────────────────────────────────────────────────

interface WeixinMessage {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  client_id?: string
  create_time_ms?: number
  item_list?: Array<{ type?: number; text_item?: { text?: string }; voice_item?: { text?: string } }>
  context_token?: string
}

interface GetUpdatesResp {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeixinMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

interface QRCodeResp {
  qrcode: string
  qrcode_img_content: string
}

interface QRStatusResp {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired'
  bot_token?: string
  ilink_bot_id?: string
  baseurl?: string
  ilink_user_id?: string
}

// ── API functions ─────────────────────────────────────────

async function getUpdates(baseUrl: string, token: string | undefined, buf: string, timeoutMs: number): Promise<GetUpdatesResp> {
  try {
    return await apiFetch(baseUrl, 'ilink/bot/getupdates', {
      get_updates_buf: buf,
      base_info: {},
    }, token, timeoutMs) as GetUpdatesResp
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: buf }
    }
    throw e
  }
}

async function sendMessage(baseUrl: string, token: string | undefined, to: string, text: string, contextToken?: string): Promise<void> {
  const clientId = `weworker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await apiFetch(baseUrl, 'ilink/bot/sendmessage', {
    msg: {
      from_user_id: '',
      to_user_id: to,
      client_id: clientId,
      message_type: 2, // BOT
      message_state: 2, // FINISH
      item_list: text ? [{ type: 1, text_item: { text } }] : undefined,
      context_token: contextToken,
    },
    base_info: {},
  }, token)
}

export async function fetchQRCode(baseUrl: string): Promise<QRCodeResp> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = `${base}ilink/bot/get_bot_qrcode?bot_type=3`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`)
  return await res.json() as QRCodeResp
}

export async function pollQRStatus(baseUrl: string, qrcode: string): Promise<QRStatusResp> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'iLink-App-ClientVersion': '1' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`QR status failed: ${res.status}`)
    return await res.json() as QRStatusResp
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === 'AbortError') return { status: 'wait' }
    throw e
  }
}

// ── CDN upload & image sending ────────────────────────────

const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16
}

interface UploadedFileInfo {
  filekey: string
  downloadEncryptedQueryParam: string
  aeskey: string
  fileSize: number
  fileSizeCiphertext: number
}

async function uploadImageToCdn(
  imageBuffer: Buffer,
  toUserId: string,
  baseUrl: string,
  token?: string,
): Promise<UploadedFileInfo> {
  const rawsize = imageBuffer.length
  const rawfilemd5 = crypto.createHash('md5').update(imageBuffer).digest('hex')
  const filesize = aesEcbPaddedSize(rawsize)
  const filekey = crypto.randomBytes(16).toString('hex')
  const aeskey = crypto.randomBytes(16)

  // Step 1: get upload URL
  const uploadResp = await apiFetch(baseUrl, 'ilink/bot/getuploadurl', {
    filekey,
    media_type: 1, // IMAGE
    to_user_id: toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    no_need_thumb: true,
    aeskey: aeskey.toString('hex'),
    base_info: {},
  }, token) as { upload_param?: string }

  if (!uploadResp.upload_param) {
    throw new Error('getUploadUrl returned no upload_param')
  }

  // Step 2: encrypt and upload to CDN
  const ciphertext = encryptAesEcb(imageBuffer, aeskey)
  const cdnUrl = `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadResp.upload_param)}&filekey=${encodeURIComponent(filekey)}`

  const cdnRes = await fetch(cdnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(ciphertext),
  })
  if (!cdnRes.ok) throw new Error(`CDN upload failed: ${cdnRes.status}`)

  const downloadParam = cdnRes.headers.get('x-encrypted-param')
  if (!downloadParam) throw new Error('CDN response missing x-encrypted-param')

  return {
    filekey,
    downloadEncryptedQueryParam: downloadParam,
    aeskey: aeskey.toString('hex'),
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  }
}

async function sendImageMessage(
  baseUrl: string,
  token: string | undefined,
  to: string,
  uploaded: UploadedFileInfo,
  contextToken?: string,
  caption?: string,
): Promise<void> {
  const items: Array<Record<string, unknown>> = []
  if (caption) {
    items.push({ type: 1, text_item: { text: caption } })
  }
  items.push({
    type: 2, // IMAGE
    image_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString('base64'), // hex string → UTF-8 bytes → base64 (matches OpenClaw)
        encrypt_type: 1,
      },
      mid_size: uploaded.fileSizeCiphertext,
    },
  })

  // Send each item as a separate message (matching OpenClaw behavior)
  for (const item of items) {
    const clientId = `weworker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await apiFetch(baseUrl, 'ilink/bot/sendmessage', {
      msg: {
        from_user_id: '',
        to_user_id: to,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [item],
        context_token: contextToken,
      },
      base_info: {},
    }, token)
  }
}

// ── Typing & Config API ───────────────────────────────────

interface GetConfigResp {
  ret?: number
  errmsg?: string
  typing_ticket?: string
}

async function getConfig(baseUrl: string, token: string | undefined, ilinkUserId: string, contextToken?: string): Promise<GetConfigResp> {
  return await apiFetch(baseUrl, 'ilink/bot/getconfig', {
    ilink_user_id: ilinkUserId,
    context_token: contextToken,
    base_info: {},
  }, token, 10_000) as GetConfigResp
}

async function sendTyping(baseUrl: string, token: string | undefined, ilinkUserId: string, typingTicket: string, status: 1 | 2): Promise<void> {
  try {
    await apiFetch(baseUrl, 'ilink/bot/sendtyping', {
      ilink_user_id: ilinkUserId,
      typing_ticket: typingTicket,
      status,
      base_info: {},
    }, token, 10_000)
  } catch (e) {
    log.error(`sendTyping error (status=${status}):`, e instanceof Error ? e.message : e)
  }
}

/**
 * Per-user typing_ticket cache with 24h TTL and exponential backoff on failure.
 */
class TypingTicketCache {
  private _cache = new Map<string, { ticket: string; nextFetchAt: number; retryMs: number }>()
  private _baseUrl: string
  private _token: string | undefined

  constructor(baseUrl: string, token?: string) {
    this._baseUrl = baseUrl
    this._token = token
  }

  async getTicket(userId: string, contextToken?: string): Promise<string> {
    const now = Date.now()
    const entry = this._cache.get(userId)
    if (entry && now < entry.nextFetchAt) return entry.ticket

    try {
      const resp = await getConfig(this._baseUrl, this._token, userId, contextToken)
      if (resp.ret === 0 || resp.ret === undefined) {
        const ticket = resp.typing_ticket ?? ''
        this._cache.set(userId, {
          ticket,
          nextFetchAt: now + Math.random() * 24 * 60 * 60_000,
          retryMs: 2_000,
        })
        return ticket
      }
    } catch (e) {
      log.error(`getConfig failed for ${userId}:`, e instanceof Error ? e.message : e)
    }

    // On failure: exponential backoff
    const prevRetry = entry?.retryMs ?? 2_000
    const nextRetry = Math.min(prevRetry * 2, 3600_000)
    this._cache.set(userId, {
      ticket: entry?.ticket ?? '',
      nextFetchAt: now + nextRetry,
      retryMs: nextRetry,
    })
    return entry?.ticket ?? ''
  }
}

// ── Helpers ───────────────────────────────────────────────

function extractTextBody(msg: WeixinMessage): string {
  if (!msg.item_list?.length) return ''
  for (const item of msg.item_list) {
    if (item.type === 1 && item.text_item?.text) return item.text_item.text
    // Voice-to-text
    if (item.type === 3 && item.voice_item?.text) return item.voice_item.text
  }
  return ''
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MSG_LEN) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += MAX_MSG_LEN) {
    chunks.push(text.slice(i, i + MAX_MSG_LEN))
  }
  return chunks
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })
}

// ── Channel implementation ────────────────────────────────

export interface WeixinChannelConfig {
  token: string
  base_url?: string
}

export class WeixinChannel implements Channel {
  private _config: WeixinChannelConfig

  private _status: ChannelStatus = { status: 'starting' }
  private _running = false
  private _abortController: AbortController | null = null
  // context_token cache: userId → token
  private _contextTokens = new Map<string, string>()
  // getUpdates cursor
  private _getUpdatesBuf = ''
  // typing ticket cache
  private _typingCache: TypingTicketCache | null = null
  // Pending ask_user resolvers: userId → resolve function
  private _pendingChoiceResolvers = new Map<string, (answer: string) => void>()

  constructor(config: WeixinChannelConfig) {
    this._config = config

  }

  getStatus(): ChannelStatus {
    return this._status
  }

  async start(): Promise<void> {
    this._running = true
    this._status = { status: 'starting' }
    this._abortController = new AbortController()
    this._typingCache = new TypingTicketCache(this._baseUrl, this._config.token)

    // Restore persisted notify target (context_token) from DB
    const saved = store.getLatestChannelNotifyTarget('weixin')
    if (saved?.extra?.context_token && saved.extra.user_id) {
      this._contextTokens.set(saved.extra.user_id, saved.extra.context_token)
      log.info(`restored notify target: ${saved.extra.user_id}`)
    }

    this._pollLoop().catch(e => {
      log.error('poll loop error:', e)
      this._status = { status: 'error', error: e instanceof Error ? e.message : String(e) }
    })
  }

  async stop(): Promise<void> {
    this._running = false
    this._abortController?.abort()
    this._abortController = null
  }

  /**
   * 主动发送通知消息到最近一个有 context_token 的微信用户。
   * 微信 iLink Bot API 要求有 context_token 才能发消息，
   * 所以只有之前跟 bot 对话过的用户才能收到通知。
   */
  async sendNotification(text: string): Promise<void> {
    // 找最近一个有 context_token 的用户
    const entries = [...this._contextTokens.entries()]
    if (entries.length === 0) {
      throw new Error('没有可用的微信用户 context_token，无法发送通知（需要用户先跟 bot 对话过）')
    }
    // 用最后一个（最近缓存的）
    const [userId, contextToken] = entries[entries.length - 1]
    log.info(`sending notification to ${userId}`)
    for (const chunk of splitMessage(text)) {
      await sendMessage(this._baseUrl, this._config.token, userId, chunk, contextToken)
    }

    // 把通知内容记录到该用户对应的 work 中，桌面端可查看
    try {
      const { work } = store.getOrCreateChannelWork('weixin', userId, '')
      store.appendMessage(work.id, 'assistant', [{ type: 'text', text }])
      store.markExternalWrite()
    } catch (e) {
      log.error('failed to persist notification to work:', e)
    }
  }

  private get _baseUrl(): string {
    return this._config.base_url || DEFAULT_BASE_URL
  }

  private async _pollLoop(): Promise<void> {
    let consecutiveFailures = 0
    let nextTimeoutMs = LONG_POLL_TIMEOUT_MS
    const signal = this._abortController?.signal

    // First successful poll marks us as connected
    this._status = { status: 'connected' }
    log.info('channel connected, starting long-poll loop')

    while (this._running && !signal?.aborted) {
      try {
        const resp = await getUpdates(this._baseUrl, this._config.token, this._getUpdatesBuf, nextTimeoutMs)

        if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms > 0) {
          nextTimeoutMs = resp.longpolling_timeout_ms
        }

        // Check for API errors
        const isError = (resp.ret !== undefined && resp.ret !== 0) || (resp.errcode !== undefined && resp.errcode !== 0)
        if (isError) {
          consecutiveFailures++
          log.error(`getUpdates error: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)

          if (resp.errcode === -14 || resp.ret === -14) {
            // Session expired
            this._status = { status: 'error', error: '会话已过期，请重新扫码登录' }
            log.error('session expired, stopping')
            return
          }

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            consecutiveFailures = 0
            await sleep(BACKOFF_DELAY_MS, signal)
          } else {
            await sleep(RETRY_DELAY_MS, signal)
          }
          continue
        }

        consecutiveFailures = 0
        this._status = { status: 'connected' }

        if (resp.get_updates_buf) {
          this._getUpdatesBuf = resp.get_updates_buf
        }

        for (const msg of resp.msgs ?? []) {
          this._handleInbound(msg).catch(e => log.error('message handling error:', e))
        }
      } catch (e) {
        if (signal?.aborted) return
        consecutiveFailures++
        log.error(`poll error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, e)
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0
          this._status = { status: 'error', error: e instanceof Error ? e.message : String(e) }
          await sleep(BACKOFF_DELAY_MS, signal)
        } else {
          await sleep(RETRY_DELAY_MS, signal)
        }
      }
    }
  }

  private async _handleInbound(msg: WeixinMessage): Promise<void> {
    const fromUserId = msg.from_user_id ?? ''
    if (!fromUserId) return

    const text = extractTextBody(msg)
    if (!text.trim()) return

    // Cache context_token
    if (msg.context_token) {
      this._contextTokens.set(fromUserId, msg.context_token)
      // Persist to DB so it survives restarts
      store.saveChannelNotifyTarget('weixin', fromUserId, {
        user_id: fromUserId,
        context_token: msg.context_token,
      })
    }

    log.info(`inbound from=${fromUserId} text="${text.slice(0, 50)}"`)

    const replyFn = async (content: string) => {
      const ct = this._contextTokens.get(fromUserId)
      if (!ct) {
        log.error(`no context_token for ${fromUserId}, cannot reply`)
        return
      }
      await sendMessage(this._baseUrl, this._config.token, fromUserId, content, ct)
    }

    // Check if there's a pending ask_user choice for this user
    const pendingResolver = this._pendingChoiceResolvers.get(fromUserId)
    if (pendingResolver) {
      this._pendingChoiceResolvers.delete(fromUserId)
      pendingResolver(text.trim())
      return
    }

    // /new command — create work with empty title, will be set on first message
    if (text.trim() === '/new') {
      store.resetChannelWork('weixin', fromUserId, '')
      await replyFn('已开启新对话 ✓')
      return
    }

    // /id command — reply with current work short ID
    if (text.trim() === '/id') {
      const existing = store.getOrCreateChannelWork('weixin', fromUserId, '')
      const shortId = existing.work.id.slice(0, 8)
      await replyFn(`当前对话 ID: ${shortId}`)
      return
    }

    if (text.trim() === '/myid') {
      await replyFn(`你的用户 ID：${fromUserId}\n${CHANNEL_MYID_HINT}`)
      return
    }

    const settings = getSettings()
    if (!settings.api_key) {
      await replyFn('WeWorker 尚未配置 API Key，请在设置中配置后重试。')
      return
    }

    const { work } = store.getOrCreateChannelWork('weixin', fromUserId, '')
    store.appendMessage(work.id, 'user', [{ type: 'text', text }])
    store.markExternalWrite()

    // Auto-title: immediate fallback from text, then async LLM refinement
    const isFirstMessage = !work.title
    if (isFirstMessage) {
      store.updateTitle(work.id, `（微信）${generateTitle(text)}`)
      generateTitleWithLLM(text, settings).then(llmTitle => {
        if (llmTitle) {
          store.updateTitle(work.id, `（微信）${llmTitle}`)
          store.markExternalWrite()
        }
      })
    }

    const wm = store.getWorkWithMessages(work.id)!

    // Start typing indicator
    const ct = this._contextTokens.get(fromUserId)
    let typingTicket = ''
    if (this._typingCache && ct) {
      typingTicket = await this._typingCache.getTicket(fromUserId, ct)
      if (typingTicket) {
        await sendTyping(this._baseUrl, this._config.token, fromUserId, typingTicket, 1)
      }
    }

    // Typing keepalive every 5s + "正在处理..." ping every 10s
    let typingKeepaliveTimer: ReturnType<typeof setInterval> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null

    if (typingTicket) {
      typingKeepaliveTimer = setInterval(() => {
        sendTyping(this._baseUrl, this._config.token, fromUserId, typingTicket, 1).catch(() => {})
      }, 5000)
    }
    pingTimer = setInterval(() => {
      replyFn('正在处理...').catch(() => {})
    }, 10000)

    const channelPermissionMode = getChannelPermissionMode('weixin', fromUserId)

    let fullText: string
    let images: string[]
    let toolCalls: store.ContentBlock[]
    let timing: store.ContentBlock | null
    try {
      ;({ text: fullText, images, toolCalls, timing } = await runChannelChat(wm.messages, settings, {
        channelPermissionMode,
        askUserHandler: async (question, options) => {
          const lines = [`${question}`]
          options.forEach((opt, i) => {
            lines.push(`${i + 1}. ${opt.label}${opt.description ? ` — ${opt.description}` : ''}`)
          })
          lines.push('', '回复数字选择，或直接输入你的答案')
          await replyFn(lines.join('\n'))

          return new Promise<string>((resolve) => {
            const timer = setTimeout(() => {
              this._pendingChoiceResolvers.delete(fromUserId)
              resolve(options[0]?.label ?? '1')
            }, 3 * 60 * 1000)

            this._pendingChoiceResolvers.set(fromUserId, (answer) => {
              clearTimeout(timer)
              const num = parseInt(answer, 10)
              if (num >= 1 && num <= options.length) {
                resolve(options[num - 1].label)
              } else {
                resolve(answer)
              }
            })
          })
        },
      }))
    } catch (e) {
      log.error('chat error:', e)
      await replyFn(`处理失败：${e instanceof Error ? e.message : String(e)}`)
      return
    } finally {
      // Stop typing indicator and ping timer
      if (typingKeepaliveTimer) clearInterval(typingKeepaliveTimer)
      if (pingTimer) clearInterval(pingTimer)
      if (typingTicket) {
        await sendTyping(this._baseUrl, this._config.token, fromUserId, typingTicket, 2)
      }
    }

    // Persist assistant response (including tool call records for desktop debugging)
    const assistantContent: store.ContentBlock[] = []
    for (const tc of toolCalls) assistantContent.push(tc)
    if (fullText) assistantContent.push({ type: 'text', text: fullText })
    for (const img of images) {
      const alreadyAttached = toolCalls.some(tc => tc.type === 'tool_use' && tc.image === img)
      if (!alreadyAttached) {
        assistantContent.push({ type: 'tool_use', id: `img-${Date.now()}`, name: 'capture_screenshot', args: {}, image: img, status: 'done' })
      }
    }
    if (assistantContent.length > 0) {
      if (timing) assistantContent.push(timing)
      store.appendMessage(work.id, 'assistant', assistantContent)
      store.markExternalWrite()
    }

    // Send reply
    if (fullText) {
      for (const chunk of splitMessage(fullText)) {
        await replyFn(chunk)
      }
    }

    // Send images via CDN upload
    for (const imgBase64 of images) {
      try {
        const ct = this._contextTokens.get(fromUserId)
        if (!ct) { log.error('no context_token, skipping image'); continue }
        const imgBuf = Buffer.from(imgBase64, 'base64')
        const uploaded = await uploadImageToCdn(imgBuf, fromUserId, this._baseUrl, this._config.token)
        await sendImageMessage(this._baseUrl, this._config.token, fromUserId, uploaded, ct)
        log.info(`image sent to ${fromUserId} (${imgBuf.length} bytes)`)
      } catch (e) {
        log.error('image send error:', e)
      }
    }

    if (!fullText && images.length === 0) {
      await replyFn(CHANNEL_EMPTY_REPLY_FALLBACK)
    }
  }
}
