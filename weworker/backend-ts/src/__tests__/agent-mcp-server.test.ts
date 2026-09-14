/**
 * **Feature: webcli-and-skill-architecture, Property 3: MCP 服务器始终使用 in-process 模式**
 *
 * For any combination of WEWORKER_PACKAGED environment variable value and
 * process.platform value, the mcpServer constructed in streamChat should always
 * be the result of _buildMcpServer({ channelPermissionMode }), never
 * { type: 'stdio', command: 'webmcp', args: ['mcp'] }.
 *
 * Since streamChat has many dependencies, we verify this via static analysis of
 * the agent.ts source code: the code path is unconditional (no ternary/if on
 * env/platform for mcpServer), so for ANY env/platform combination the same
 * in-process path is taken.
 *
 * **Validates: Requirements 6.4, 6.5, 7.1, 7.2**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import fs from 'node:fs'
import path from 'node:path'

// Read agent.ts source once for all tests
const agentSourcePath = path.resolve(import.meta.dirname, '..', 'agent.ts')
const agentSource = fs.readFileSync(agentSourcePath, 'utf-8')

// Generators for env/platform combinations
const arbWeworkerPackaged = fc.constantFrom('true', 'false', undefined, '1', '0', '')
const arbPlatform = fc.constantFrom('darwin', 'win32', 'linux', 'freebsd')

describe('Property 3: MCP 服务器始终使用 in-process 模式', () => {
  // Feature: webcli-and-skill-architecture, Property 3: MCP 服务器始终使用 in-process 模式

  it('source code does NOT contain stdio MCP server pattern for any env/platform combination', () => {
    fc.assert(
      fc.property(arbWeworkerPackaged, arbPlatform, (weworkerPackaged, platform) => {
        // The old conditional pattern used a ternary that checked WEWORKER_PACKAGED
        // and process.platform to decide between _buildMcpServer and stdio.
        // After the refactor, the code should have NO conditional — just a direct call.

        // 1. Must NOT contain the old stdio fallback object literal
        expect(agentSource).not.toContain("type: 'stdio'")
        expect(agentSource).not.toContain('type: "stdio"')
        expect(agentSource).not.toContain("command: 'webmcp'")
        expect(agentSource).not.toContain('command: "webmcp"')
        expect(agentSource).not.toContain("args: ['mcp']")
        expect(agentSource).not.toContain('args: ["mcp"]')

        // 2. Must contain the direct in-process mcpServer assignment
        expect(agentSource).toContain('const mcpServer = _buildMcpServer({')
        expect(agentSource).toContain('channelPermissionMode,')

        // 3. The mcpServer assignment should be unconditional — no ternary
        //    involving WEWORKER_PACKAGED or process.platform for mcpServer
        //    Extract lines containing 'mcpServer' assignment
        const mcpServerLines = agentSource
          .split('\n')
          .filter(line => line.includes('mcpServer') && line.includes('=') && !line.includes('mcpServers'))

        for (const line of mcpServerLines) {
          // Should not have a ternary conditional on the mcpServer assignment
          expect(line).not.toContain('?')
          // Should not reference WEWORKER_PACKAGED in the assignment
          expect(line).not.toContain('WEWORKER_PACKAGED')
          // Should not reference process.platform in the assignment
          expect(line).not.toContain('process.platform')
        }
      }),
      { numRuns: 100 },
    )
  })

  it('mcpServer is assigned directly from _buildMcpServer without conditionals', () => {
    fc.assert(
      fc.property(arbWeworkerPackaged, arbPlatform, (_weworkerPackaged, _platform) => {
        // Find the mcpServer const declaration
        const mcpServerDecl = agentSource
          .split('\n')
          .find(line => line.trim().startsWith('const mcpServer') && line.includes('_buildMcpServer'))

        // The declaration must exist
        expect(mcpServerDecl).toBeDefined()

        // It should be a simple assignment, not a conditional
        expect(mcpServerDecl).toContain('_buildMcpServer({')
        expect(mcpServerDecl).not.toContain('?')
        expect(mcpServerDecl).not.toContain('process.env')
      }),
      { numRuns: 100 },
    )
  })
})
