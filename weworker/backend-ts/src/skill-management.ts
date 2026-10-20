import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { listSkillDirectoryResources, saveSkillDirectoryResources } from './custom-skills.js'

export function sanitizeSkillDirectoryName(name: string): string {
  return (name || 'custom').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/^\.+$/, '_').trim() || 'custom'
}

function skillError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode })
}

function resolveDirectory(root: string, name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim()
    || /[<>:"/\\|?*\x00-\x1F]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    skillError('请输入有效的 Skill 文件夹名称')
  }
  const directory = path.join(root, name)
  if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) {
    skillError('Skill 路径不是普通文件夹')
  }
  for (const file of ['SKILL.md', 'SKILL.md.disabled']) {
    const target = path.join(directory, file)
    try { if (!fs.lstatSync(target).isFile()) skillError('Skill 文件不可读写') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return directory
}

export function readManagedSkill(root: string, name: string) {
  const dir = resolveDirectory(root, name)
  if (!fs.existsSync(dir)) skillError('Skill not found', 404)
  const active = path.join(dir, 'SKILL.md')
  const disabled = path.join(dir, 'SKILL.md.disabled')
  const file = fs.existsSync(disabled) ? disabled : fs.existsSync(active) ? active : null
  return {
    name, content: file ? fs.readFileSync(file, 'utf8') : '',
    enabled: file === active, draft: file === null,
    resources: listSkillDirectoryResources(dir),
  }
}

export function createSkillFolder(root: string, name: unknown) {
  const directory = resolveDirectory(root, name)
  fs.mkdirSync(root, { recursive: true })
  try { fs.mkdirSync(directory) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') skillError('Skill 文件夹名称已存在', 409)
    throw error
  }
  return readManagedSkill(root, name as string)
}

export function setSkillEnabled(root: string, name: string, enabled?: boolean) {
  const skill = readManagedSkill(root, name)
  if (skill.draft) skillError('请先编写 SKILL.md，再启用此 Skill', 409)
  const next = enabled ?? !skill.enabled
  const dir = resolveDirectory(root, name)
  const active = path.join(dir, 'SKILL.md')
  const disabled = path.join(dir, 'SKILL.md.disabled')
  if (next !== skill.enabled) fs.renameSync(next ? disabled : active, next ? active : disabled)
  return { ok: true, enabled: next }
}

export function saveManagedSkill(root: string, input: { name: string; previousName?: string; content: string; resources?: unknown[] }) {
  if (typeof input.name !== 'string' || !input.name.trim() || typeof input.content !== 'string') skillError('name and content required')
  const frontmatter = input.content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  const markdownName = frontmatter?.match(/^\s*name\s*:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '').trim()
  const name = sanitizeSkillDirectoryName(markdownName && !markdownName.includes('{{') && !markdownName.includes('}}') ? markdownName : input.name)
  const dir = resolveDirectory(root, name)
  if (input.previousName && input.previousName !== name) {
    const previous = resolveDirectory(root, input.previousName)
    if (fs.existsSync(dir)) skillError(`Skill name already exists: ${name}`, 409)
    if (!fs.existsSync(previous)) skillError('Skill not found', 404)
    fs.renameSync(previous, dir)
  }
  const existed = fs.existsSync(dir)
  const active = path.join(dir, 'SKILL.md')
  const disabled = path.join(dir, 'SKILL.md.disabled')
  fs.mkdirSync(dir, { recursive: true })
  // A new empty folder stays empty until the user actually writes a document.
  // Saving a draft's first document leaves it off until explicitly enabled.
  if (input.content.trim() || fs.existsSync(active) || fs.existsSync(disabled)) {
    const destination = fs.existsSync(disabled) || (existed && !fs.existsSync(active)) ? disabled : active
    fs.writeFileSync(destination, input.content)
  }
  if (Array.isArray(input.resources)) saveSkillDirectoryResources(dir, input.resources)
  return { ok: true, ...readManagedSkill(root, name) }
}

export function createSkillManagementRouter(root: string) {
  const router = Router()
  router.get('/skills', (_req, res, next) => {
    try {
      fs.mkdirSync(root, { recursive: true })
      const skills = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
        try { return [readManagedSkill(root, entry.name)] } catch { return [] }
      })
      res.json(skills)
    } catch (error) { next(error) }
  })
  router.post('/skills/folders', (req, res, next) => {
    try { res.status(201).json({ ok: true, ...createSkillFolder(root, req.body?.name) }) }
    catch (error) { next(error) }
  })
  router.post('/skills', (req, res, next) => {
    try { res.json(saveManagedSkill(root, req.body ?? {})) } catch (error) { next(error) }
  })
  router.post('/skills/:name/toggle', (req, res, next) => {
    try {
      if (req.body?.enabled !== undefined && typeof req.body.enabled !== 'boolean') skillError('enabled must be boolean')
      res.json(setSkillEnabled(root, req.params.name, req.body?.enabled))
    } catch (error) { next(error) }
  })
  router.use((error: Error & { statusCode?: number }, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
    res.status(error.statusCode ?? 500).json({ detail: error.statusCode ? error.message : 'Skill 操作失败，请重试' })
  })
  return router
}
