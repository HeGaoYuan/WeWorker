import { describe, it, expect } from 'vitest'
import {
  resolveToolCallTimeout,
  QQ_MAIL_TOOL_CALL_TIMEOUT_MS,
  DEFAULT_TOOL_CALL_TIMEOUT_MS,
} from '../tool-timeouts.js'

describe('resolveToolCallTimeout', () => {
  it('uses 3 minutes for mail.qq.com tools', () => {
    expect(resolveToolCallTimeout('mail.qq.com.download_invoices_by_invoice')).toBe(
      QQ_MAIL_TOOL_CALL_TIMEOUT_MS,
    )
    expect(resolveToolCallTimeout('mail.qq.com.search_emails')).toBe(QQ_MAIL_TOOL_CALL_TIMEOUT_MS)
    expect(QQ_MAIL_TOOL_CALL_TIMEOUT_MS).toBe(180000)
  })

  it('uses default timeout for other tools', () => {
    expect(resolveToolCallTimeout('ef.example.com.search_flow')).toBe(DEFAULT_TOOL_CALL_TIMEOUT_MS)
    expect(resolveToolCallTimeout('open_browser')).toBe(DEFAULT_TOOL_CALL_TIMEOUT_MS)
  })
})
