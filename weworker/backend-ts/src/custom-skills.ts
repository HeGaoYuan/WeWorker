import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getResourcePreviewExtensionSet } from './config.js'
import { getRuntimeSkillsDir } from './runtime-skills-dir.js'

const CONFIG_DIR = path.join(os.homedir(), '.weworker')
const CUSTOM_SKILLS_FILE = path.join(CONFIG_DIR, 'custom-skills.json')
const CUSTOM_SKILLS_ASSETS_DIR = path.join(CONFIG_DIR, 'custom-skills-assets')
const SKILL_MARKDOWN_FILES = new Set(['SKILL.md', 'SKILL.md.disabled'])
const CUSTOM_SKILL_MARKER_FILENAME = '.weworker-custom-skill.json'
const CUSTOM_SKILL_KIND = 'custom'
const RESOURCE_PREVIEW_MAX_BYTES = 256 * 1024
export const FORCE_RESOURCE_PREVIEW_MAX_BYTES = RESOURCE_PREVIEW_MAX_BYTES
const DEFAULT_CUSTOM_SKILL_MARKDOWN = `---
name: "{{填写 skill 标识，例如：site.task_helper}}"
description: "{{填写一句话说明：这个 skill 适合在什么情况下使用}}"
allowed-tools: Bash(webcli *)
---

# {{填写 skill 名称}}

## 适用场景

{{填写用户什么时候应该使用这个 skill，例如：当需要整理某系统的工单、批量生成报告、调用随附脚本处理数据时。}}

## 操作步骤

1. {{填写第一步操作或判断条件}}
2. {{填写第二步操作或处理方式}}
3. {{填写输出结果应满足的格式或标准}}

## 输入参数

- \`{{参数名}}\`：{{填写参数含义、格式、是否必填}}

## 随附文件使用说明

{{如果添加了脚本或资料文件，在这里说明如何读取或执行；添加资源后系统会在本文档末尾追加文件位置提示，可直接编辑。}}

## 注意事项

{{填写限制、异常处理、权限要求或不要执行的操作。}}`

export type CustomSkillParam = {
  name: string
  type: string
  description: string
  required: boolean
}

export type CustomSkill = {
  id: string
  name: string
  description: string
  parameters: CustomSkillParam[]
  markdown: string
  resources: CustomSkillResource[]
  source: 'custom'
  promptOnly: true
  enabled?: boolean
  directoryName?: string
}

export type CustomSkillResource = {
  name: string
  relativePath: string
  size: number
  modified_at: string
  is_directory?: boolean
  readable?: boolean
  content?: string
}

type CustomSkillStore = {
  version: 1
  sites: Record<string, CustomSkill[]>
}

type CustomSkillMarker = {
  kind: typeof CUSTOM_SKILL_KIND
  version: 1
  siteId: string
  skillId: string
  skillName: string
  description?: string
  parameters?: CustomSkillParam[]
}

export class DuplicateSkillNameError extends Error {
  statusCode = 409

  constructor(skillName: string) {
    super(`Skill name already exists: ${skillName}`)
    this.name = 'DuplicateSkillNameError'
  }
}

function readStore(): CustomSkillStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(CUSTOM_SKILLS_FILE, 'utf-8')) as Partial<CustomSkillStore>
    if (parsed && typeof parsed === 'object' && parsed.sites && typeof parsed.sites === 'object') {
      return { version: 1, sites: parsed.sites as Record<string, CustomSkill[]> }
    }
  } catch {
    // Missing or malformed custom skill file: treat as empty.
  }
  return { version: 1, sites: {} }
}

function writeStore(store: CustomSkillStore): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CUSTOM_SKILLS_FILE, JSON.stringify(store, null, 2))
}

function makeSkillId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizePathSegment(value: string): string {
  return (value || 'custom')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+$/, '_')
    .trim() || 'custom'
}

function safeItemName(name: string): string {
  const safeName = path.basename(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  if (!safeName || safeName === '.' || safeName === '..') return ''
  return safeName
}

function uniqueDestinationPath(parent: string, name: string): string {
  const parsed = path.parse(name)
  let candidate = path.join(parent, name)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${parsed.name} (${index})${parsed.ext}`)
    index += 1
  }
  return candidate
}

function customSkillAssetDir(siteId: string, skillId: string): string {
  return path.join(CUSTOM_SKILLS_ASSETS_DIR, sanitizePathSegment(siteId), sanitizePathSegment(skillId))
}

function customSkillDirName(skillName: string): string {
  return `webcli-${sanitizePathSegment(skillName)}`
}

function customSkillDir(skillName: string): string {
  return path.join(getRuntimeSkillsDir(), customSkillDirName(skillName))
}

function skillNameFromCustomDirName(dirName: string): string {
  return String(dirName || '').replace(/^webcli-/, '')
}

function extractSkillNameFromMarkdown(content: string): string {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return ''
  const nameLine = match[1].split(/\r?\n/).find((line) => /^\s*name\s*:/.test(line))
  if (!nameLine) return ''
  const name = nameLine
    .replace(/^\s*name\s*:\s*/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
  if (!name || name.includes('{{') || name.includes('}}')) return ''
  return name.startsWith('webcli-') ? name.slice('webcli-'.length) : name
}

function resolveRequestedSkillName(skill: CustomSkill): string {
  return extractSkillNameFromMarkdown(skill.markdown) || skill.name
}

function findCustomSkillDirByName(siteId: string, skillName: string): string {
  const runtimeDir = getRuntimeSkillsDir()
  if (!fs.existsSync(runtimeDir)) return ''
  const targetName = sanitizePathSegment(skillName).toLowerCase()
  for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(runtimeDir, entry.name)
    const marker = readCustomSkillMarker(dir)
    if (marker?.siteId !== siteId) continue
    if (sanitizePathSegment(skillNameFromCustomDirName(entry.name)).toLowerCase() === targetName) return dir
  }
  return ''
}

function assertUniqueCustomSkillNames(siteId: string, skills: CustomSkill[]): void {
  const seen = new Map<string, string>()
  for (const skill of skills) {
    const key = sanitizePathSegment(resolveRequestedSkillName(skill)).toLowerCase()
    const previousId = seen.get(key)
    if (previousId && previousId !== skill.id) throw new DuplicateSkillNameError(resolveRequestedSkillName(skill))
    seen.set(key, skill.id)
  }

  for (const skill of skills) {
    const existingDir = findCustomSkillDirByName(siteId, resolveRequestedSkillName(skill))
    if (!existingDir) continue
    const marker = readCustomSkillMarker(existingDir)
    if (marker?.skillId && marker.skillId !== skill.id) throw new DuplicateSkillNameError(resolveRequestedSkillName(skill))
  }
}

function readCustomSkillMarker(skillDir: string): CustomSkillMarker | null {
  const markerPath = path.join(skillDir, CUSTOM_SKILL_MARKER_FILENAME)
  if (!fs.existsSync(markerPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as Partial<CustomSkillMarker>
    if (parsed?.kind !== CUSTOM_SKILL_KIND || parsed.version !== 1) return null
    if (!parsed.siteId || !parsed.skillId) return null
    return {
      kind: CUSTOM_SKILL_KIND,
      version: 1,
      siteId: String(parsed.siteId),
      skillId: String(parsed.skillId),
      skillName: String(parsed.skillName || ''),
      description: typeof parsed.description === 'string' ? parsed.description : '',
      parameters: Array.isArray(parsed.parameters)
        ? parsed.parameters.map(normalizeParam).filter((param): param is CustomSkillParam => !!param)
        : [],
    }
  } catch {
    return null
  }
}

function clearLegacyCustomSkills(siteId: string): void {
  const store = readStore()
  if (!store.sites[siteId]) return
  delete store.sites[siteId]
  writeStore(store)
}

function writeCustomSkillMarker(skillDir: string, skill: CustomSkill, siteId: string): void {
  const marker: CustomSkillMarker = {
    kind: CUSTOM_SKILL_KIND,
    version: 1,
    siteId,
    skillId: skill.id,
    skillName: skill.name,
    description: skill.description,
    parameters: skill.parameters,
  }
  fs.writeFileSync(path.join(skillDir, CUSTOM_SKILL_MARKER_FILENAME), `${JSON.stringify(marker, null, 2)}\n`, 'utf-8')
}

function normalizeRelativePath(relativePath: unknown): string {
  if (typeof relativePath !== 'string') return ''
  const normalized = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  if (normalized.some((part) => part === '.' || part === '..')) return ''
  return normalized.join('/')
}

function listResourceFiles(root: string): CustomSkillResource[] {
  if (!fs.existsSync(root)) return []
  const out: CustomSkillResource[] = []
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name)
      const stat = fs.statSync(absolute)
      if (entry.isDirectory()) {
        out.push({
          name: entry.name,
          relativePath: path.relative(root, absolute).replace(/\\/g, '/'),
          size: 0,
          modified_at: stat.mtime.toISOString(),
          is_directory: true,
        })
        walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      const item: CustomSkillResource = {
        name: entry.name,
        relativePath: path.relative(root, absolute).replace(/\\/g, '/'),
        size: stat.size,
        modified_at: stat.mtime.toISOString(),
        is_directory: false,
      }
      if (isReadableResourceFile(absolute, stat.size)) {
        item.readable = true
        item.content = fs.readFileSync(absolute, 'utf-8')
      }
      out.push(item)
    }
  }
  walk(root)
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function isReadableResourceFile(filePath: string, size: number): boolean {
  if (size > RESOURCE_PREVIEW_MAX_BYTES) return false
  return getResourcePreviewExtensionSet().has(path.extname(filePath).toLowerCase())
}

function bufferLooksBinary(buffer: Buffer): boolean {
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) return true
  }
  return false
}

function resolveResourceFilePath(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) throw new Error('invalid resource path')
  if (SKILL_MARKDOWN_FILES.has(normalized)) throw new Error('cannot preview skill markdown here')

  const absolute = path.join(root, ...normalized.split('/'))
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.resolve(absolute)
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('invalid resource path')
  }
  return absolute
}

export function readResourceFilePreview(
  root: string,
  relativePath: string,
  maxBytes = FORCE_RESOURCE_PREVIEW_MAX_BYTES,
): {
  content: string
  truncated: boolean
  size: number
  previewBytes: number
  isBinary: boolean
} {
  const absolute = resolveResourceFilePath(root, relativePath)
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error('resource file not found')
  }

  const size = fs.statSync(absolute).size
  const previewBytes = Math.min(size, maxBytes)
  const truncated = size > maxBytes
  const buffer = Buffer.alloc(previewBytes)
  const fd = fs.openSync(absolute, 'r')
  try {
    fs.readSync(fd, buffer, 0, previewBytes, 0)
  } finally {
    fs.closeSync(fd)
  }

  if (bufferLooksBinary(buffer)) {
    return {
      content: `（二进制文件，共 ${size} 字节，无法在文本编辑器中预览其内容。）`,
      truncated: false,
      size,
      previewBytes: 0,
      isBinary: true,
    }
  }

  const prefix = truncated
    ? `（已截断：以下仅显示前 ${previewBytes} 字节，文件共 ${size} 字节）\n\n`
    : ''

  return {
    content: `${prefix}${buffer.toString('utf-8')}`,
    truncated,
    size,
    previewBytes,
    isBinary: false,
  }
}

export function resolveCustomSkillAssetDir(siteId: string, skillId: string): string {
  const skill = listCustomSkills(siteId).find((item) => item.id === skillId)
  if (!skill) return customSkillAssetDir(siteId, skillId)
  return customSkillDir(skill.name)
}

function normalizeParam(param: unknown): CustomSkillParam | null {
  if (!param || typeof param !== 'object') return null
  const input = param as Partial<CustomSkillParam>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return null
  return {
    name,
    type: typeof input.type === 'string' && input.type.trim() ? input.type.trim() : 'string',
    description: typeof input.description === 'string' ? input.description : '',
    required: input.required === true,
  }
}

function normalizeResource(resource: unknown): CustomSkillResource | null {
  if (!resource || typeof resource !== 'object') return null
  const input = resource as Partial<CustomSkillResource>
  const relativePath = normalizeRelativePath(input.relativePath)
  if (!relativePath) return null
  return {
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : path.basename(relativePath),
    relativePath,
    size: typeof input.size === 'number' && Number.isFinite(input.size) ? input.size : 0,
    modified_at: typeof input.modified_at === 'string' ? input.modified_at : '',
    is_directory: input.is_directory === true,
    readable: input.readable === true,
    content: typeof input.content === 'string' ? input.content : undefined,
  }
}

export function normalizeCustomSkill(skill: unknown): CustomSkill | null {
  if (!skill || typeof skill !== 'object') return null
  const input = skill as Partial<CustomSkill>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return null
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : makeSkillId()
  const parameters = Array.isArray(input.parameters)
    ? input.parameters.map(normalizeParam).filter((param): param is CustomSkillParam => !!param)
    : []
  const resources = Array.isArray(input.resources)
    ? input.resources.map(normalizeResource).filter((resource): resource is CustomSkillResource => !!resource)
    : []
  return {
    id,
    name,
    description: typeof input.description === 'string' ? input.description : '',
    parameters,
    markdown: typeof input.markdown === 'string' ? input.markdown : DEFAULT_CUSTOM_SKILL_MARKDOWN,
    resources,
    source: 'custom',
    promptOnly: true,
  }
}

export function listCustomSkills(siteId: string): CustomSkill[] {
  migrateLegacyCustomSkills(siteId)
  const runtimeDir = getRuntimeSkillsDir()
  if (!fs.existsSync(runtimeDir)) return []

  const skills: CustomSkill[] = []
  for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(runtimeDir, entry.name)
    const marker = readCustomSkillMarker(dir)
    if (!marker || marker.siteId !== siteId) continue
    const skillPath = path.join(dir, 'SKILL.md')
    const disabledPath = path.join(dir, 'SKILL.md.disabled')
    const markdownPath = fs.existsSync(skillPath) ? skillPath : disabledPath
    const markdown = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, 'utf-8') : DEFAULT_CUSTOM_SKILL_MARKDOWN
    const diskName = skillNameFromCustomDirName(entry.name)
    skills.push({
      id: marker.skillId,
      enabled: fs.existsSync(skillPath) && !fs.existsSync(disabledPath),
      directoryName: entry.name,
      name: diskName,
      description: marker.description || '',
      parameters: marker.parameters || [],
      markdown,
      resources: listCustomSkillDirectoryResources(dir),
      source: 'custom',
      promptOnly: true,
    })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

function buildResourceKeepPaths(resources: CustomSkillResource[]): Set<string> {
  const keep = new Set<string>()
  for (const resource of resources) {
    const relativePath = normalizeRelativePath(resource.relativePath)
    if (!relativePath) continue
    keep.add(relativePath)
    const parts = relativePath.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      keep.add(parts.slice(0, index).join('/'))
    }
  }
  return keep
}

function pruneResourceTree(root: string, keepPaths: Set<string>): void {
  if (!fs.existsSync(root)) return
  const walk = (dir: string, relPrefix = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute, rel)
        if (!keepPaths.has(rel)) {
          fs.rmSync(absolute, { recursive: true, force: true })
        }
        continue
      }
      if (!keepPaths.has(rel) && fs.statSync(absolute).isFile()) {
        fs.unlinkSync(absolute)
      }
    }
  }
  walk(root)
}

function findCustomSkillDirById(siteId: string, skillId: string): string {
  const runtimeDir = getRuntimeSkillsDir()
  if (!fs.existsSync(runtimeDir)) return ''
  for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(runtimeDir, entry.name)
    const marker = readCustomSkillMarker(dir)
    if (marker?.siteId === siteId && marker.skillId === skillId) return dir
  }
  return ''
}

function listCustomSkillDirectoryResources(root: string): CustomSkillResource[] {
  return listResourceFiles(root).filter((resource) => {
    const normalized = normalizeRelativePath(resource.relativePath)
    return normalized && !SKILL_MARKDOWN_FILES.has(normalized) && normalized !== CUSTOM_SKILL_MARKER_FILENAME
  })
}

function persistSkillResources(siteId: string, skill: CustomSkill): CustomSkill {
  const previousDir = findCustomSkillDirById(siteId, skill.id)
  const requestedName = resolveRequestedSkillName(skill)
  const skillRoot = customSkillDir(requestedName)
  let currentDir = previousDir || skillRoot
  if (previousDir && path.resolve(previousDir) !== path.resolve(skillRoot)) {
    if (!fs.existsSync(skillRoot)) {
      fs.renameSync(previousDir, skillRoot)
      currentDir = skillRoot
    } else {
      throw new DuplicateSkillNameError(requestedName)
    }
  }

  fs.mkdirSync(currentDir, { recursive: true })
  const diskName = skillNameFromCustomDirName(path.basename(currentDir))
  const persistedSkill = { ...skill, name: diskName }

  try {
    const disabledPath = path.join(currentDir, 'SKILL.md.disabled')
    const markdownPath = fs.existsSync(disabledPath) ? disabledPath : path.join(currentDir, 'SKILL.md')
    fs.writeFileSync(markdownPath, skill.markdown.trimEnd() ? `${skill.markdown.trimEnd()}\n` : '', 'utf-8')
    writeCustomSkillMarker(currentDir, persistedSkill, siteId)
  } catch (error) {
    if (previousDir && path.resolve(previousDir) !== path.resolve(currentDir) && fs.existsSync(currentDir) && !fs.existsSync(previousDir)) {
      fs.renameSync(currentDir, previousDir)
    }
    throw error
  }

  const keepPaths = buildResourceKeepPaths(persistedSkill.resources)
  for (const fileName of SKILL_MARKDOWN_FILES) keepPaths.add(fileName)
  keepPaths.add(CUSTOM_SKILL_MARKER_FILENAME)

  if (fs.existsSync(currentDir)) {
    pruneResourceTree(currentDir, keepPaths)
  }

  for (const resource of persistedSkill.resources) {
    const relativePath = normalizeRelativePath(resource.relativePath)
    if (!relativePath || SKILL_MARKDOWN_FILES.has(relativePath) || relativePath === CUSTOM_SKILL_MARKER_FILENAME) continue
    const absolutePath = path.join(currentDir, ...relativePath.split('/'))

    if (resource.is_directory) {
      fs.mkdirSync(absolutePath, { recursive: true })
      continue
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    if (resource.readable === true && typeof resource.content === 'string') {
      fs.writeFileSync(absolutePath, resource.content, 'utf-8')
    } else if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, '')
    }
  }

  return {
    ...persistedSkill,
    resources: listCustomSkillDirectoryResources(currentDir),
  }
}

export function saveCustomSkills(siteId: string, skills: unknown[]): CustomSkill[] {
  const normalized = skills
    .map(normalizeCustomSkill)
    .filter((skill): skill is CustomSkill => !!skill)

  assertUniqueCustomSkillNames(siteId, normalized)

  const next = normalized
    .map((skill) => persistSkillResources(siteId, skill))

  const keepIds = new Set(next.map((skill) => skill.id))
  for (const existing of listCustomSkills(siteId)) {
    if (!keepIds.has(existing.id)) {
      const dir = findCustomSkillDirById(siteId, existing.id)
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  return next
}

function migrateLegacyCustomSkills(siteId: string): void {
  const store = readStore()
  const legacySkills = (store.sites[siteId] || []).map((skill) => normalizeCustomSkill(skill)).filter((skill): skill is CustomSkill => !!skill)
  if (legacySkills.length === 0) return
  for (const skill of legacySkills) {
    if (findCustomSkillDirById(siteId, skill.id)) continue
    const legacyRoot = customSkillAssetDir(siteId, skill.id)
    const resources = fs.existsSync(legacyRoot) ? listResourceFiles(legacyRoot) : skill.resources
    persistSkillResources(siteId, { ...skill, resources })
  }
  clearLegacyCustomSkills(siteId)
}

function buildSkillDirectoryKeepPaths(resources: CustomSkillResource[]): Set<string> {
  const keep = buildResourceKeepPaths(resources)
  for (const fileName of SKILL_MARKDOWN_FILES) keep.add(fileName)
  return keep
}

function importFilesIntoDirectory(importRoot: string, sourcePaths: unknown[]): void {
  fs.mkdirSync(importRoot, { recursive: true })
  for (const rawPath of sourcePaths) {
    if (typeof rawPath !== 'string' || !rawPath.trim()) continue
    const resolved = path.resolve(rawPath)
    const stat = fs.statSync(resolved)
    const destName = safeItemName(path.basename(resolved))
    if (!destName) continue
    const dest = uniqueDestinationPath(importRoot, destName)
    if (stat.isDirectory()) {
      fs.cpSync(resolved, dest, { recursive: true, errorOnExist: true })
    } else if (stat.isFile()) {
      fs.copyFileSync(resolved, dest)
    }
  }
}

/** List resource files under a public skill directory (excluding SKILL.md). */
export function listSkillDirectoryResources(root: string): CustomSkillResource[] {
  return listResourceFiles(root).filter((resource) => {
    const normalized = normalizeRelativePath(resource.relativePath)
    return normalized && !SKILL_MARKDOWN_FILES.has(normalized)
  })
}

/** Persist resource metadata/files under a public skill directory. */
export function saveSkillDirectoryResources(root: string, resourcesInput: unknown[]): CustomSkillResource[] {
  const resources = resourcesInput
    .map(normalizeResource)
    .filter((resource): resource is CustomSkillResource => !!resource)
  fs.mkdirSync(root, { recursive: true })

  const keepPaths = buildSkillDirectoryKeepPaths(resources)
  if (fs.existsSync(root)) {
    pruneResourceTree(root, keepPaths)
  }

  for (const resource of resources) {
    const relativePath = normalizeRelativePath(resource.relativePath)
    if (!relativePath || SKILL_MARKDOWN_FILES.has(relativePath)) continue
    const absolutePath = path.join(root, ...relativePath.split('/'))

    if (resource.is_directory) {
      fs.mkdirSync(absolutePath, { recursive: true })
      continue
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    if (resource.readable === true && typeof resource.content === 'string') {
      fs.writeFileSync(absolutePath, resource.content, 'utf-8')
    } else if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, '')
    }
  }

  return listSkillDirectoryResources(root)
}

/** Import local files/folders into a public skill directory. */
export function importSkillDirectoryResources(
  root: string,
  sourcePaths: unknown[],
  parentRelativePath = '',
): CustomSkillResource[] {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) throw new Error('paths is required')
  fs.mkdirSync(root, { recursive: true })
  const parentDir = normalizeRelativePath(parentRelativePath)
  const importRoot = parentDir ? path.join(root, ...parentDir.split('/')) : root
  importFilesIntoDirectory(importRoot, sourcePaths)
  return listSkillDirectoryResources(root)
}

export function importCustomSkillResources(
  siteId: string,
  skillId: string,
  sourcePaths: unknown[],
  parentRelativePath = '',
): CustomSkill {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) throw new Error('paths is required')
  const siteSkills = listCustomSkills(siteId)
  const skillIndex = siteSkills.findIndex((skill) => skill.id === skillId)
  if (skillIndex < 0) throw new Error('custom skill not found')

  const targetRoot = customSkillDir(siteSkills[skillIndex].name)
  const parentDir = normalizeRelativePath(parentRelativePath)
  const importRoot = parentDir ? path.join(targetRoot, ...parentDir.split('/')) : targetRoot
  importFilesIntoDirectory(importRoot, sourcePaths)

  const updatedSkill = {
    ...siteSkills[skillIndex],
    resources: listCustomSkillDirectoryResources(targetRoot),
  }
  return updatedSkill
}
