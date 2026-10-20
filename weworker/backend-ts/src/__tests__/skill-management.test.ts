import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSkillManagementRouter } from '../skill-management.js'
import { buildEnabledSkillIndex } from '../context/runtime-context.js'
import { fingerprintSkillFiles } from '../chat-session.js'
import { listCustomSkills, saveCustomSkills } from '../custom-skills.js'
import { syncBundledWebcliSkills } from '../webcli-skills.js'
// @ts-expect-error Exercise the same installer used by desktop startup.
import { installSkills } from '../../../../webcli/skill-installer.js'

const fixtureState = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  return { root: '', home: fs.mkdtempSync(path.join(os.tmpdir(), 'skill-management-home-')) }
})
vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, default: { ...actual, homedir: () => fixtureState.home }, homedir: () => fixtureState.home }
})
afterAll(() => fs.rmSync(fixtureState.home, { recursive: true, force: true }))
vi.mock('../runtime-skills-dir.js', () => ({ getRuntimeSkillsDir: () => fixtureState.root }))
let root: string, server: Server, url: string
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(fixtureState.home, 'skills-'))
  fixtureState.root = path.join(root, 'skills')
  const app = express()
  app.use(express.json(), createSkillManagementRouter(fixtureState.root))
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})
const post = (route: string, body: unknown) => fetch(`${url}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const list = async () => (await fetch(`${url}/skills`)).json()

describe('Skill management HTTP routes', () => {
  it('creates a physically empty folder, lists it after reload, and refuses activation until authored', async () => {
    const response = await post('/skills/folders', { name: 'example-skill' })
    expect(response.status).toBe(201)
    expect(fs.readdirSync(path.join(fixtureState.root, 'example-skill'))).toEqual([])
    expect(await list()).toMatchObject([{ name: 'example-skill', content: '', enabled: false, draft: true, resources: [] }])
    expect((await post('/skills/example-skill/toggle', { enabled: true })).status).toBe(409)
    expect((await post('/skills/folders', { name: 'example-skill' })).status).toBe(409)
    expect(fs.readdirSync(path.join(fixtureState.root, 'example-skill'))).toEqual([])
  })

  it.each(['../escape', '..', '.', 'CON', 'LPT1.txt', 'trailing.', ' bad', 'a/b', 'a\\b', 'C:drive', ''])('rejects invalid folder name %s without writing', async name => {
    expect((await post('/skills/folders', { name })).status).toBe(400)
    expect(fs.existsSync(fixtureState.root)).toBe(false)
  })

  it('preserves drafts on resource-only save and keeps the first document disabled until enabled', async () => {
    await post('/skills/folders', { name: 'draft' })
    await post('/skills', { name: 'draft', content: '', resources: [{ relativePath: 'notes.txt', readable: true, content: 'Notes' }] })
    expect(fs.readdirSync(path.join(fixtureState.root, 'draft'))).toEqual(['notes.txt'])
    const saved = await post('/skills', { name: 'draft', content: '# Example' })
    expect(await saved.json()).toMatchObject({ draft: false, enabled: false })
    await post('/skills/draft/toggle', { enabled: true })
    expect(buildEnabledSkillIndex(fixtureState.root)).toContain('draft')
  })

  it('sets enabled idempotently, survives edits and rename, and invalidates session discovery', async () => {
    await post('/skills', { name: 'example', content: '# Example' })
    const before = fingerprintSkillFiles([fixtureState.root])
    expect(await (await post('/skills/example/toggle', { enabled: false })).json()).toMatchObject({ enabled: false })
    expect(await (await post('/skills/example/toggle', { enabled: false })).json()).toMatchObject({ enabled: false })
    expect(fingerprintSkillFiles([fixtureState.root])).not.toBe(before)
    expect(buildEnabledSkillIndex(fixtureState.root)).toBe('')
    await post('/skills', { name: 'example', previousName: 'example', content: '---\nname: renamed\n---\nUpdated' })
    expect(fs.existsSync(path.join(fixtureState.root, 'renamed', 'SKILL.md'))).toBe(false)
    expect(await list()).toMatchObject([{ name: 'renamed', enabled: false, content: expect.stringContaining('Updated') }])
    expect(await (await post('/skills/renamed/toggle', {})).json()).toMatchObject({ enabled: true })
    expect(buildEnabledSkillIndex(fixtureState.root)).toContain('renamed')
  })

  it('rejects invalid toggle requests and missing Skills', async () => {
    expect((await post('/skills/missing/toggle', { enabled: false })).status).toBe(404)
    expect((await post('/skills/missing/toggle', { enabled: 'false' })).status).toBe(400)
  })

  it('preserves site custom Skill state through subsequent content saves', async () => {
    const skill = { id: 'fixture-skill', name: 'example-task', markdown: '# First', resources: [] }
    saveCustomSkills('fixture-site', [skill])
    await post('/skills/webcli-example-task/toggle', { enabled: false })
    saveCustomSkills('fixture-site', [{ ...skill, markdown: '# Updated' }])
    expect(listCustomSkills('fixture-site')[0]).toMatchObject({ enabled: false, directoryName: 'webcli-example-task', markdown: '# Updated\n' })
    expect(buildEnabledSkillIndex(fixtureState.root)).toBe('')
  })

  it('keeps bundled Skills disabled through startup install and per-turn synchronization', async () => {
    const builtin = path.join(root, 'builtin')
    fs.mkdirSync(builtin)
    fs.writeFileSync(path.join(builtin, '.profile.json'), JSON.stringify({ schema_version: 1, profile: 'public', adapters: [] }))
    vi.stubEnv('WEWORKER_BUILD_PROFILE', 'public')
    vi.stubEnv('WEWORKER_BUILTIN_ADAPTERS_DIR', builtin)
    vi.stubEnv('WEWORKER_USER_ADAPTERS_DIR', path.join(root, 'user'))
    vi.stubEnv('WEBCLI_ADAPTERS_DIR', path.join(root, 'user'))
    vi.stubEnv('WEWORKER_ADAPTER_DATA_DIR', path.join(root, 'data'))
    await installSkills({ target: fixtureState.root })
    for (const name of ['webcli', 'complex-task-planner', 'webcli-browser', 'webcli-api-exploration']) {
      expect((await post(`/skills/${name}/toggle`, { enabled: false })).status).toBe(200)
    }
    await installSkills({ target: fixtureState.root })
    syncBundledWebcliSkills(fixtureState.root, path.resolve('../../webcli/skills'))
    for (const name of ['webcli', 'complex-task-planner', 'webcli-browser', 'webcli-api-exploration']) {
      expect(fs.existsSync(path.join(fixtureState.root, name, 'SKILL.md'))).toBe(false)
      expect(fs.readFileSync(path.join(fixtureState.root, name, 'SKILL.md.disabled'), 'utf8').length).toBeGreaterThan(0)
    }
  })
})
