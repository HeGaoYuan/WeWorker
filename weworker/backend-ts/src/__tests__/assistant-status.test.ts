import { describe, expect, it, vi } from 'vitest'
import {
  appendAssistantStatusLine,
  ensureAssistantStatusLine,
  extractAssistantStatusLine,
  finalizeAssistantTextWithStatus,
  normalizeAssistantStatusLine,
} from '../assistant-status.js'

describe('assistant status helpers', () => {
  it('extracts an existing 当前状态 line', () => {
    const text = 'Step 1: 检查文件\n当前状态：正在执行第 1 步'
    expect(extractAssistantStatusLine(text)).toBe('当前状态：正在执行第 1 步')
  })

  it('normalizes a bare status fragment into 当前状态 line', () => {
    expect(normalizeAssistantStatusLine('正在执行第 2 步')).toBe('当前状态：正在执行第 2 步')
  })

  it('appends a missing status line at the end of the reply', () => {
    const text = 'Step 1: 检查文件路径'
    expect(appendAssistantStatusLine(text, '当前状态：正在执行第 1 步')).toBe(
      'Step 1: 检查文件路径\n\n当前状态：正在执行第 1 步',
    )
  })

  it('does not call the supplement generator when status already exists', async () => {
    const generator = vi.fn(async () => '当前状态：不会被使用')
    const result = await ensureAssistantStatusLine({
      text: '已经完成检查。\n当前状态：第 1 步已完成',
      generateStatusLine: generator,
    })

    expect(result).toBe('已经完成检查。\n当前状态：第 1 步已完成')
    expect(generator).not.toHaveBeenCalled()
  })

  it('calls the supplement generator when status is missing', async () => {
    const generator = vi.fn(async () => '当前状态：正在等待下一步')
    const result = await ensureAssistantStatusLine({
      text: '已经完成检查。',
      generateStatusLine: generator,
    })

    expect(generator).toHaveBeenCalledTimes(1)
    expect(result).toBe('已经完成检查。\n\n当前状态：正在等待下一步')
  })

  it('uses the fallback status line when the supplement generator returns invalid text', async () => {
    const generator = vi.fn(async () => '')
    const result = await ensureAssistantStatusLine({
      text: '已经完成检查。',
      generateStatusLine: generator,
      fallbackStatusLine: '当前状态：已完成当前回复，等待下一步指令',
    })

    expect(result).toBe('已经完成检查。\n\n当前状态：已完成当前回复，等待下一步指令')
  })

  it('adds fallback status text when the assistant only returned tools', async () => {
    const result = await finalizeAssistantTextWithStatus({
      text: '',
      hasAssistantContent: true,
      generateStatusLine: async () => null,
      fallbackStatusLine: '当前状态：已更新 Todo，等待下一步',
    })

    expect(result).toBe('当前状态：已更新 Todo，等待下一步')
  })
})
