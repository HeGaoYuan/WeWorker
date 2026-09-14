/**
 * Group consecutive tool_use blocks for compact list rendering.
 * Skill and plan-management tools stay as standalone blocks.
 */
import { isPlanManagementTool } from './todowrite-state.js'

export function isGroupableToolUse(block) {
  if (!block || block.type !== 'tool_use' || block.image) return false
  if (block.name === 'Skill') return false
  if (isPlanManagementTool(block.name)) return false
  return true
}

export function partitionContentBlocks(content) {
  if (!content?.length) return []

  const items = []
  let i = 0

  while (i < content.length) {
    const block = content[i]
    if (isGroupableToolUse(block)) {
      const blocks = []
      while (i < content.length && isGroupableToolUse(content[i])) {
        blocks.push(content[i])
        i += 1
      }
      items.push({
        kind: 'tool_exec_group',
        blocks,
        key: blocks.map((entry) => entry.id).filter(Boolean).join('-') || `tool-group-${i}`,
      })
      continue
    }

    items.push({
      kind: 'block',
      block,
      key: block.id ?? `block-${i}`,
    })
    i += 1
  }

  return items
}
