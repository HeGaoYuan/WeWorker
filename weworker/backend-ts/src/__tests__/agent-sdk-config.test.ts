import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentSource = fs.readFileSync(path.resolve(__dirname, '../agent.ts'), 'utf8')

describe('agent SDK security config', () => {
  it('derives tool policy, filesystem guard, and sandbox settings from the channel mode', () => {
    expect(agentSource).toContain('createUnifiedToolGuard(channelPermissionMode)')
    expect(agentSource).toContain('createWeWorkerToolPolicy(channelPermissionMode)')
    expect(agentSource).toContain('buildAgentFilesystemSettings(getUserDirectory(), channelPermissionMode)')
    expect(agentSource).toContain('const policyDecision = await toolPolicy(toolName, input, context)')
    expect(agentSource).toContain('return filesystemToolGuard(toolName, input as Record<string, unknown>)')
    expect(agentSource).toContain('canUseTool,')
    expect(agentSource).toContain("permissionMode: 'default'")
    expect(agentSource).not.toContain("permissionMode: 'bypassPermissions'")
    expect(agentSource).toContain("channelPermissionMode === 'no_bash'")
    expect(agentSource).toContain("'WebFetch'")
    expect(agentSource).toContain("'AskUserQuestion'")
    expect(agentSource).toContain("WEWORKER_ADAPTERS_DIR: path.join(getUserDirectory(), '.claude', 'skills')")
  })
})
