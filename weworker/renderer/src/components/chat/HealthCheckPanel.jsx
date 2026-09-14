import { useState, useEffect, useRef } from 'react'
import { displayToolName } from '../../utils/tool-name.js'
import { backendFetch } from '../../api/http.js'
const STATUS_ICON = { pending: '⏳', pass: '✅', fail: '❌', uncovered: '⚪' }

/** Check if a tool result JSON string contains an error */
function hasError(resultStr) {
  if (!resultStr) return false
  try {
    const parsed = JSON.parse(resultStr)
    return parsed && typeof parsed === 'object' && 'error' in parsed
  } catch { return false }
}

export default function HealthCheckPanel({ toolNames, messages, streaming, workId, siteId }) {
  const [expandedTool, setExpandedTool] = useState(null)
  const [analyzed, setAnalyzed] = useState(false)
  const prevStreamingRef = useRef(streaming)

  // Extract tool calls from messages in real-time
  const toolCalls = {}
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    for (const block of (msg.content ?? [])) {
      if (block.type !== 'tool_use') continue
      const name = displayToolName(block.name || '')
      if (!name) continue
      const resultStr = block.result ?? ''
      const isError = hasError(resultStr)
      const status = block.status === 'running' ? 'pending' : (isError ? 'fail' : 'pass')
      // Keep the worst result (fail > pass > pending)
      const existing = toolCalls[name]
      if (!existing || (status === 'fail') || (status === 'pass' && existing.status === 'pending')) {
        toolCalls[name] = {
          status,
          args: block.args ? JSON.stringify(block.args).slice(0, 300) : '',
          result: resultStr.slice(0, 500),
        }
      }
    }
  }

  // Build tool status list
  const toolStatuses = toolNames.map(name => {
    const displayName = displayToolName(name)
    const call = toolCalls[displayName]
    return {
      name: displayName,
      status: call?.status || (streaming ? 'pending' : 'uncovered'),
      args: call?.args,
      result: call?.result,
    }
  })

  const passed = toolStatuses.filter(t => t.status === 'pass').length
  const failed = toolStatuses.filter(t => t.status === 'fail').length
  const uncovered = toolStatuses.filter(t => t.status === 'uncovered').length
  const pending = toolStatuses.filter(t => t.status === 'pending').length
  const isDone = !streaming && messages.some(m => m.role === 'assistant' && m.content?.length > 0)

  // Persist results when streaming stops
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && !analyzed && workId && siteId) {
      setAnalyzed(true)
      backendFetch('/health-check/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, siteId }),
      }).catch(() => {})
    }
    prevStreamingRef.current = streaming
  }, [streaming, analyzed, workId, siteId])

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)',
      padding: '10px 20px', maxHeight: 240, overflowY: 'auto',
    }}>
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          工具检测 · {toolNames.length} 个工具
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {isDone
            ? `${passed} 通过 · ${failed} 失败 · ${uncovered} 未覆盖`
            : `${passed + failed} / ${toolNames.length} 已检测${pending > 0 ? ` · ${pending} 进行中` : ''}`
          }
        </span>
      </div>

      {/* Tool list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {toolStatuses.map(tool => {
          const isOpen = expandedTool === tool.name
          return (
            <div key={tool.name}>
              <div
                onClick={() => setExpandedTool(isOpen ? null : tool.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                  borderRadius: 6, cursor: 'pointer', fontSize: 12,
                  background: isOpen ? 'var(--bg-tertiary)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 13 }}>{STATUS_ICON[tool.status]}</span>
                <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)', flex: 1, fontSize: 11 }}>
                  {tool.name}
                </code>
                {tool.status === 'pending' && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>运行中...</span>
                )}
              </div>
              {isOpen && (tool.args || tool.result) && (
                <div style={{ marginLeft: 28, marginBottom: 4, fontSize: 10 }}>
                  {tool.args && (
                    <div style={{ marginBottom: 2 }}>
                      <span style={{ color: 'var(--text-muted)' }}>参数: </span>
                      <code style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{tool.args}</code>
                    </div>
                  )}
                  {tool.result && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>返回: </span>
                      <code style={{
                        fontFamily: 'monospace', wordBreak: 'break-all',
                        color: tool.status === 'pass' ? '#22c55e' : tool.status === 'fail' ? 'var(--error)' : 'var(--text-secondary)',
                        display: 'block', maxHeight: 50, overflow: 'hidden',
                      }}>{tool.result}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
