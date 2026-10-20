import { describe, expect, it } from 'vitest'
import { describeAdapterForSkill } from '../dedicated-agents/skill-author.js'

describe('dedicated Agent Skill author confirmation guidance', () => {
  it('preserves explicit confirmation opt-outs for write tools', () => {
    const description = describeAdapterForSkill({
      id: 'example.com',
      name: 'Example',
      description: 'Example Adapter',
      requiresAuth: false,
      authCheckTool: null,
      tools: [
        { name: 'example.com.run', description: 'Run a command', parameters: {}, safety: 'write', requiresConfirmation: false },
        { name: 'example.com.delete', description: 'Delete an item', parameters: {}, safety: 'write', requiresConfirmation: true },
      ],
    })

    expect(description).toContain('example.com.run【写操作（无需二次确认）】')
    expect(description).toContain('example.com.delete【写操作（需确认）】')
  })
})
