import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSkillContextCollector, buildLoadedSkillContext } from '../skill-context.js'
import { buildContextAssembly, createTurnContextCollector, estimateContextTokens } from '../context-assembly.js'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-skill-context-'))
  directories.push(root)
  const directory = path.join(root, 'example')
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '# Example\nsearch(keyword)\nview_cart()')
  const text = `Base directory for this skill: ${directory}\n\n${'details '.repeat(1500)}\nview_cart()`
  const collector = createSkillContextCollector([root])
  const start = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'call-1', name: 'Skill', input: { skill: 'example' } }] } }
  const result = { type: 'user', tool_use_result: { success: true, commandName: 'example' }, message: { content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'Launching skill: example' }] } }
  const body = { type: 'user', isSynthetic: true, uuid: 'body-1', message: { content: [{ type: 'text', text }] } }
  return { root, directory, text, collector, start, result, body }
}

describe('loaded Skill context', () => {
  it('retains a successful synthetic Skill body across persisted turns without truncation or duplication', () => {
    const { collector, start, result, body, root, text } = fixture()
    expect(collector.observe(start)).toEqual([])
    expect(collector.observe(result)).toEqual([])
    const captured = collector.observe(body)
    expect(captured).toHaveLength(1)
    expect(captured[0].text).toBe(text)
    expect(collector.observe(body)).toEqual([])
    const messages = JSON.parse(JSON.stringify([{ content: captured }, { content: captured }]))
    const replay = buildLoadedSkillContext(messages, [root])
    expect(replay).toContain('view_cart()')
    expect(replay.split(text)).toHaveLength(2)
  })

  it('does not treat user text or a failed Skill call as loaded context', () => {
    const { collector, start, result, body } = fixture()
    collector.observe(start)
    collector.observe({ ...result, tool_use_result: { success: false, commandName: 'example' } })
    expect(collector.observe(body)).toEqual([])
    collector.observe(result)
    expect(collector.observe({ ...body, isSynthetic: false })).toEqual([])
  })

  it('requires a matching successful call and a source within the allowed Skill directories', () => {
    const { collector, start, result, body, directory } = fixture()
    expect(collector.observe(body)).toEqual([])
    collector.observe(start)
    collector.observe(result)
    expect(collector.observe({ ...body, message: { content: [{ type: 'text', text: body.message.content[0].text.replace(directory, path.dirname(directory)) }] } })).toEqual([])
    expect(collector.observe(body)).toHaveLength(1)
  })

  it('invalidates loaded content after a Skill changes or is disabled', () => {
    const { collector, start, result, body, root, directory } = fixture()
    collector.observe(start)
    collector.observe(result)
    const messages = [{ content: collector.observe(body) }]
    fs.writeFileSync(path.join(directory, 'SKILL.md'), '# Updated\nnew_parameter')
    expect(buildLoadedSkillContext(messages, [root])).toBe('')
    fs.renameSync(path.join(directory, 'SKILL.md'), path.join(directory, 'SKILL.md.disabled'))
    expect(buildLoadedSkillContext(messages, [root])).toBe('')
    expect(buildLoadedSkillContext(messages, [])).toBe('')
  })

  it('keeps the loaded prefix stable across turns and outside conversation compression', () => {
    const loadedSkills = '[已加载的 Skill]\nsearch(keyword)\nview_cart()'
    const base = { systemPrompt: 'fixed rules', identityPrompt: 'fixed rules', skillIndex: 'example', loadedSkills }
    const first = buildContextAssembly({ ...base, prompt: 'first turn' })
    const second = buildContextAssembly({ ...base, prompt: 'conversation summary\nnext turn' })
    expect(first.sdk.system_prompt).toBe(second.sdk.system_prompt)
    expect(second.sdk.prompt).toBe(`${loadedSkills}\n\nconversation summary\nnext turn`)
    expect(second.work.conversation).not.toContain('view_cart')
    expect(second.runtime.skills).toContain(loadedSkills)
    expect(second.snapshot.categories.find(item => item.id === 'skills')?.estimated_tokens).toBe(estimateContextTokens(`example\n\n${loadedSkills}`))
  })

  it('counts newly received Skill bodies in the skills category instead of conversation', () => {
    const assembly = buildContextAssembly({ systemPrompt: 'rules', identityPrompt: 'rules', prompt: 'hello' })
    const collector = createTurnContextCollector(assembly.snapshot)
    collector.observe({ type: 'skill_context', id: 'call-1', content: 'search(keyword)' })
    collector.observe({ type: 'skill_context', id: 'call-1', content: 'search(keyword)' })
    const [event] = collector.finish()
    expect(event.context.categories.find(item => item.id === 'skills')?.estimated_tokens).toBe(estimateContextTokens('search(keyword)'))
    expect(event.context.categories.find(item => item.id === 'conversation')).toEqual(assembly.snapshot.categories.find(item => item.id === 'conversation'))
  })
})
