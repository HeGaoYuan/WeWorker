import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isGroupableToolUse, partitionContentBlocks } from '../utils/group-tool-blocks.js'
import { getToolExecGroupLabel, getToolExecLineText } from '../utils/tool-display.js'

describe('group-tool-blocks', () => {
  it('groups consecutive Bash and Read blocks together', () => {
    const content = [
      { type: 'tool_use', id: '1', name: 'Bash', args: { command: 'echo 1' } },
      { type: 'tool_use', id: '2', name: 'Read', args: { file_path: 'C:\\settings.json' } },
      { type: 'tool_use', id: '3', name: 'Bash', args: { command: 'echo 2' } },
    ]
    const items = partitionContentBlocks(content)
    assert.equal(items.length, 1)
    assert.equal(items[0].kind, 'tool_exec_group')
    assert.equal(items[0].blocks.length, 3)
  })

  it('keeps Skill as standalone block', () => {
    const content = [
      { type: 'tool_use', id: '1', name: 'Skill', args: { skill: 'webcli' } },
      { type: 'tool_use', id: '2', name: 'Read', args: { file_path: '/tmp/a' } },
    ]
    const items = partitionContentBlocks(content)
    assert.equal(items.length, 2)
    assert.equal(items[0].kind, 'block')
    assert.equal(items[0].block.name, 'Skill')
    assert.equal(items[1].kind, 'tool_exec_group')
  })

  it('does not group plan management tools', () => {
    assert.equal(isGroupableToolUse({ type: 'tool_use', name: 'TodoWrite', args: {} }), false)
    assert.equal(isGroupableToolUse({ type: 'tool_use', name: 'TaskCreate', args: {} }), false)
    assert.equal(isGroupableToolUse({ type: 'tool_use', name: 'Read', args: {} }), true)
  })
})

describe('tool-display exec labels', () => {
  it('uses mixed-operation label when Read is included', () => {
    const blocks = [
      { name: 'Bash', args: { command: 'ls' } },
      { name: 'Read', args: { file_path: 'C:\\settings.json' } },
    ]
    assert.equal(getToolExecGroupLabel(blocks), '执行了 2 个操作')
  })

  it('formats Read line text with file path', () => {
    const line = getToolExecLineText({
      name: 'Read',
      args: { file_path: 'C:\\Users\\liuqi\\.weworker\\settings.json' },
    })
    assert.match(line, /Read C:\\Users\\liuqi\\.weworker\\settings\.json/)
  })
})
