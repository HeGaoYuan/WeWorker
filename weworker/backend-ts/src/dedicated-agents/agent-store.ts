/**
 * Dedicated agent records.
 *
 * Stored in ~/.weworker/dedicated-agents.json (override: WEWORKER_DEDICATED_AGENTS_FILE).
 * The WeCom bot secret is SM4-encrypted with the settings master key and never
 * leaves the backend; API views only expose `has_secret`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomInt, randomUUID } from 'node:crypto'
import { getConfigDirectory } from '../config.js'
import { decryptSecret, encryptSecret, isSecretStoreReady } from '../secret-store.js'

export interface DedicatedAgentRecord {
  id: string
  name: string
  description: string
  /** Adapter id of the website this agent operates. */
  site_id: string
  /** Skill directory name in the runtime skills dir; '' means Adapter capabilities only. */
  skill_name: string
  examples: string[]
  enabled: boolean
  wecom: { bot_id: string; secret_enc: string }
  /** WeCom userid of the person who paired the bot. Only this user is served. */
  owner_user_id: string
  /** One-time code the owner sends to the bot to pair; '' after pairing. */
  pairing_code: string
  /** Conversations created by this agent; hidden from the main task list. */
  work_ids: string[]
  created_at: string
  updated_at: string
}

export interface DedicatedAgentInput {
  name: string
  description?: string
  site_id: string
  skill_name?: string
  examples?: string[]
  bot_id: string
  secret: string
}

export interface DedicatedAgentPatch {
  name?: string
  description?: string
  site_id?: string
  skill_name?: string
  examples?: string[]
  enabled?: boolean
  bot?: { bot_id: string; secret: string }
}

interface StoreFile {
  version: 1
  agents: DedicatedAgentRecord[]
}

export class DedicatedAgentError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message)
    this.name = 'DedicatedAgentError'
  }
}

const NAME_MAX = 40
const DESCRIPTION_MAX = 200
const EXAMPLE_MAX = 120
const EXAMPLES_MAX = 6
const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const BOT_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/

export function getDedicatedAgentsFile(): string {
  return process.env.WEWORKER_DEDICATED_AGENTS_FILE
    || path.join(getConfigDirectory(), 'dedicated-agents.json')
}

function readFile(): StoreFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(getDedicatedAgentsFile(), 'utf8')) as Partial<StoreFile>
    if (parsed && Array.isArray(parsed.agents)) {
      return { version: 1, agents: parsed.agents.filter((agent) => agent && typeof agent.id === 'string') }
    }
  } catch {
    // Missing or unreadable file: start empty.
  }
  return { version: 1, agents: [] }
}

function writeFile(data: StoreFile): void {
  const file = getDedicatedAgentsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(temporary, file)
}

export function generatePairingCode(): string {
  return String(randomInt(100000, 1000000))
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)
}

function cleanExamples(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => cleanText(entry, EXAMPLE_MAX))
    .filter(Boolean)
    .slice(0, EXAMPLES_MAX)
}

export function normalizeSkillName(value: unknown): string {
  const name = String(value ?? '').trim()
  if (!name) return ''
  if (!SKILL_NAME_PATTERN.test(name) || name.startsWith('webcli')) {
    throw new DedicatedAgentError('Skill 名称只能包含字母、数字、点、下划线和连字符，且不能以 webcli 开头')
  }
  return name
}

function validateBot(botId: unknown, secret: unknown): { bot_id: string; secret: string } {
  const bot_id = String(botId ?? '').trim()
  const plain = String(secret ?? '').trim()
  if (!BOT_ID_PATTERN.test(bot_id)) throw new DedicatedAgentError('机器人 BotID 格式不正确')
  if (!plain || plain.length > 512) throw new DedicatedAgentError('机器人 Secret 不能为空')
  return { bot_id, secret: plain }
}

function encrypt(secret: string): string {
  if (!isSecretStoreReady()) {
    throw new DedicatedAgentError('系统密钥存储不可用，无法安全保存机器人凭证', 503)
  }
  return encryptSecret(secret)
}

function assertBotUnused(agents: DedicatedAgentRecord[], botId: string, exceptId: string | null, reservedBotIds: string[]): void {
  if (reservedBotIds.includes(botId)) {
    throw new DedicatedAgentError('该机器人已在「设置 → 通道 → 企业微信」中使用。一个机器人只能连接一个 Agent，请换一个机器人', 409)
  }
  const owner = agents.find((agent) => agent.id !== exceptId && agent.wecom.bot_id === botId)
  if (owner) {
    throw new DedicatedAgentError(`该机器人已被专属 Agent「${owner.name}」使用。一个机器人只能连接一个 Agent`, 409)
  }
}

export function listAgents(): DedicatedAgentRecord[] {
  return readFile().agents
}

export function getAgent(id: string): DedicatedAgentRecord | null {
  return readFile().agents.find((agent) => agent.id === id) ?? null
}

/** Plaintext secret for starting the WeCom connection. Backend use only. */
export function getAgentBotSecret(agent: DedicatedAgentRecord): string {
  if (!agent.wecom.secret_enc) return ''
  try {
    return decryptSecret(agent.wecom.secret_enc)
  } catch {
    return ''
  }
}

export function createAgent(input: DedicatedAgentInput, options: { reservedBotIds?: string[] } = {}): DedicatedAgentRecord {
  const name = cleanText(input.name, NAME_MAX)
  if (!name) throw new DedicatedAgentError('请填写 Agent 名称')
  const site_id = String(input.site_id ?? '').trim()
  if (!site_id) throw new DedicatedAgentError('请选择要操作的网站')
  const bot = validateBot(input.bot_id, input.secret)
  const data = readFile()
  assertBotUnused(data.agents, bot.bot_id, null, options.reservedBotIds ?? [])
  const now = new Date().toISOString()
  const record: DedicatedAgentRecord = {
    id: randomUUID().replace(/-/g, '').slice(0, 12),
    name,
    description: cleanText(input.description, DESCRIPTION_MAX),
    site_id,
    skill_name: normalizeSkillName(input.skill_name),
    examples: cleanExamples(input.examples),
    enabled: true,
    wecom: { bot_id: bot.bot_id, secret_enc: encrypt(bot.secret) },
    owner_user_id: '',
    pairing_code: generatePairingCode(),
    work_ids: [],
    created_at: now,
    updated_at: now,
  }
  data.agents.push(record)
  writeFile(data)
  return record
}

function mutate(id: string, apply: (agent: DedicatedAgentRecord, all: DedicatedAgentRecord[]) => void): DedicatedAgentRecord {
  const data = readFile()
  const agent = data.agents.find((entry) => entry.id === id)
  if (!agent) throw new DedicatedAgentError('专属 Agent 不存在', 404)
  apply(agent, data.agents)
  agent.updated_at = new Date().toISOString()
  writeFile(data)
  return agent
}

export function updateAgent(id: string, patch: DedicatedAgentPatch, options: { reservedBotIds?: string[] } = {}): DedicatedAgentRecord {
  return mutate(id, (agent, all) => {
    if (patch.name !== undefined) {
      const name = cleanText(patch.name, NAME_MAX)
      if (!name) throw new DedicatedAgentError('请填写 Agent 名称')
      agent.name = name
    }
    if (patch.description !== undefined) agent.description = cleanText(patch.description, DESCRIPTION_MAX)
    if (patch.site_id !== undefined) {
      const site = String(patch.site_id).trim()
      if (!site) throw new DedicatedAgentError('请选择要操作的网站')
      agent.site_id = site
    }
    if (patch.skill_name !== undefined) agent.skill_name = normalizeSkillName(patch.skill_name)
    if (patch.examples !== undefined) agent.examples = cleanExamples(patch.examples)
    if (patch.enabled !== undefined) agent.enabled = patch.enabled === true
    if (patch.bot) {
      const bot = validateBot(patch.bot.bot_id, patch.bot.secret)
      assertBotUnused(all, bot.bot_id, agent.id, options.reservedBotIds ?? [])
      const changedBot = bot.bot_id !== agent.wecom.bot_id
      agent.wecom = { bot_id: bot.bot_id, secret_enc: encrypt(bot.secret) }
      if (changedBot) {
        // A different bot may be visible to different people: pair again.
        agent.owner_user_id = ''
        agent.pairing_code = generatePairingCode()
      }
    }
  })
}

/** Clear the owner and issue a new pairing code. */
export function resetPairing(id: string): DedicatedAgentRecord {
  return mutate(id, (agent) => {
    agent.owner_user_id = ''
    agent.pairing_code = generatePairingCode()
  })
}

export function completePairing(id: string, userId: string): DedicatedAgentRecord {
  return mutate(id, (agent) => {
    agent.owner_user_id = userId
    agent.pairing_code = ''
  })
}

export function addAgentWork(id: string, workId: string): void {
  try {
    mutate(id, (agent) => {
      if (!agent.work_ids.includes(workId)) agent.work_ids.push(workId)
    })
  } catch {
    // Agent removed while a turn was running; nothing to record.
  }
}

export function removeAgentWork(id: string, workId: string): DedicatedAgentRecord {
  return mutate(id, (agent) => {
    agent.work_ids = agent.work_ids.filter((entry) => entry !== workId)
  })
}

/** The agent bound to a WeCom bot, so main channel settings cannot reuse it. */
export function findAgentByBotId(botId: string): DedicatedAgentRecord | null {
  const id = String(botId ?? '').trim()
  if (!id) return null
  return readFile().agents.find((agent) => agent.wecom.bot_id === id) ?? null
}

export function findAgentByWorkId(workId: string): DedicatedAgentRecord | null {
  return readFile().agents.find((agent) => agent.work_ids.includes(workId)) ?? null
}

export function deleteAgent(id: string): DedicatedAgentRecord | null {
  const data = readFile()
  const index = data.agents.findIndex((agent) => agent.id === id)
  if (index < 0) return null
  const [removed] = data.agents.splice(index, 1)
  writeFile(data)
  return removed
}

/** Work ids owned by any dedicated agent (excluded from the main task list). */
export function listAgentWorkIds(): Set<string> {
  return new Set(readFile().agents.flatMap((agent) => agent.work_ids))
}

export interface DedicatedAgentView {
  id: string
  name: string
  description: string
  site_id: string
  skill_name: string
  examples: string[]
  enabled: boolean
  wecom: { bot_id: string; has_secret: boolean }
  paired: boolean
  owner_user_id: string
  pairing_code: string
  conversation_count: number
  created_at: string
  updated_at: string
}

export function toAgentView(agent: DedicatedAgentRecord): DedicatedAgentView {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    site_id: agent.site_id,
    skill_name: agent.skill_name,
    examples: [...agent.examples],
    enabled: agent.enabled,
    wecom: { bot_id: agent.wecom.bot_id, has_secret: !!agent.wecom.secret_enc },
    paired: !!agent.owner_user_id,
    owner_user_id: agent.owner_user_id,
    pairing_code: agent.owner_user_id ? '' : agent.pairing_code,
    conversation_count: agent.work_ids.length,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
  }
}
