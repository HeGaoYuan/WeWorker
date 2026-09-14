import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveSiteMemoryFromWorkflow, saveSiteMemoryFromActionCapture } from '../site-memory.js'

const SITE_MEMORY_ENV = 'WEWORKER_SITE_MEMORY_FILE'
const tempDirs: string[] = []
let previousSiteMemoryFile = ''

beforeEach(() => {
  previousSiteMemoryFile = process.env[SITE_MEMORY_ENV] || ''
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-site-memory-'))
  tempDirs.push(dir)
  process.env[SITE_MEMORY_ENV] = path.join(dir, 'site-memory.json')
})

afterEach(() => {
  if (previousSiteMemoryFile) process.env[SITE_MEMORY_ENV] = previousSiteMemoryFile
  else delete process.env[SITE_MEMORY_ENV]
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('saveSiteMemoryFromActionCapture', () => {
  it('prefers an approval endpoint over a POST detail refresh for Chinese action names', () => {
    const saved = saveSiteMemoryFromActionCapture({
      site: 'todo.example.com',
      actionName: '批阅待办',
      mode: 'intercept',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://todo.example.com/api/todo/info/21829007',
          method: 'POST',
          requestBodyPreview: '{"id":21829007}',
          responsePreview: '{"data":{"id":21829007,"title":"申请详情","history":[]}}',
          intercepted: true,
        },
        {
          url: 'https://todo.example.com/api/todo/myApprove',
          method: 'POST',
          requestBodyPreview: '{"id":21829007,"decision":"agree"}',
          responsePreview: '{"code":0,"message":"success"}',
          intercepted: true,
        },
      ],
      recommendation: { toolName: 'todo.example.com.approve_todo_draft' },
    })

    expect(saved?.actionApiCandidates[0]?.url).toBe('https://todo.example.com/api/todo/myApprove')
  })

  it('accepts an intercepted action capture result and returns a site memory record with action candidates', () => {
    const base = deriveSiteMemoryFromWorkflow({
      tabId: 1,
      opened: { url: 'https://scheduling.example.com/' },
      pageStateBefore: { url: 'https://scheduling.example.com/' },
      resultPageState: { url: 'https://scheduling.example.com/' },
      pageStateAfter: { url: 'https://scheduling.example.com/' },
      workflow: { version: 'opencli-like-v12' },
      verdict: { pattern: 'dom_driven', recommendedStrategy: 'UI', reason: 'ui first' },
      actions: [],
    })

    expect(base?.siteKey).toBe('scheduling.example.com')

    const saved = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'book_room',
      mode: 'intercept',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/api/booking/create',
          method: 'POST',
          requestBodyPreview: '{"roomId":"A101","start":"2026-05-14T15:00:00+08:00"}',
          intercepted: true,
          blockedReason: 'side-effect-safe-capture',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.book_room_draft',
      },
    })

    expect(saved?.siteKey).toBe('scheduling.example.com')
    expect(saved?.actionApiCandidates[0]?.actionName).toBe('book_room')
    expect(saved?.actionApiCandidates[0]?.url).toBe('https://scheduling.example.com/api/booking/create')
    expect(saved?.actionApiCandidates[0]?.intercepted).toBe(true)
    expect(saved?.actionApiCandidates[0]?.toolName).toBe('scheduling.example.com.book_room_draft')
    expect(saved?.actionCaptureHistory).toHaveLength(1)
    expect(saved?.actionCaptureHistory?.[0]?.url).toBe('https://scheduling.example.com/api/booking/create')
    expect(saved?.actionEvidenceSummary?.historyCount).toBe(1)
    expect(saved?.actionEvidenceSummary?.toolSummaries[0]?.selectedUrl).toBe('https://scheduling.example.com/api/booking/create')
  })

  it('prefers the business-relevant read request for filter-style captures and preserves response preview', () => {
    const saved = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'filter_rooms',
      mode: 'observe',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/',
          method: 'GET',
        },
        {
          url: 'https://scheduling.example.com/eoss-meeting/external/hrm/user/staff',
          method: 'GET',
          responsePreview: '{"code":0}',
        },
        {
          url: 'https://scheduling.example.com/eoss-meeting/meeting/meetingrooms/getRooms?bookTime=2026-05-13%2000%3A00%3A00&workplace=%E6%AD%A6%E6%B1%89%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83&floor=11&page=1&limit=999',
          method: 'GET',
          responseContentType: 'application/json',
          responsePreview: '{"data":{"list":[{"id":"1985620980776501249","roomcode":"1106"}]}}',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.filter_rooms_draft',
      },
    })

    expect(saved?.actionApiCandidates[0]?.actionName).toBe('filter_rooms')
    expect(saved?.actionApiCandidates[0]?.toolName).toBe('scheduling.example.com.filter_rooms_draft')
    expect(saved?.actionApiCandidates[0]?.url).toContain('/meeting/meetingrooms/getRooms?')
    expect(saved?.actionApiCandidates[0]?.responsePreview).toContain('"roomcode":"1106"')
    expect(saved?.actionApiCandidates[0]?.responseContentType).toBe('application/json')
    expect(saved?.actionApiCandidates[0]?.responseHints?.listPath).toBe('data.list')
    expect(saved?.actionApiCandidates[0]?.responseHints?.itemKeys).toContain('id')
    expect(saved?.actionApiCandidates[0]?.responseHints?.displayLikeKeys).toContain('roomcode')
    expect(saved?.actionApiCandidates[0]?.responseHints?.preferredIdKey).toBe('id')
    expect(saved?.actionApiCandidates[0]?.responseHints?.preferredDisplayKey).toBe('roomcode')
    expect(saved?.actionCaptureHistory).toHaveLength(1)
    expect(saved?.actionEvidenceSummary?.toolSummaries[0]?.selectedSignals).toContain('has_response_preview')
    expect(saved?.actionEvidenceSummary?.toolSummaries[0]?.selectedSignals).toContain('json_response')
  })

  it('extracts fallback response hints from abbreviated response previews', () => {
    const saved = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'filter_rooms',
      mode: 'observe',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/eoss-meeting/meeting/meetingrooms/getRooms?bookTime=2026-05-14%2000%3A00%3A00&workplace=%E6%AD%A6%E6%B1%89%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83&floor=11&page=1&limit=999',
          method: 'GET',
          responseContentType: 'application/json',
          responsePreview: '{"code":0,"msg":"success","data":{"total":2,"list":[...]}}',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.filter_rooms_draft',
      },
    })

    expect(saved?.actionApiCandidates[0]?.responseHints?.listPath).toBe('data.list')
    expect(saved?.actionApiCandidates[0]?.responseHints?.topLevelKeys).toContain('code')
    expect(saved?.actionApiCandidates[0]?.responseHints?.topLevelKeys).toContain('data')
    expect(saved?.actionApiCandidates[0]?.responseHints?.preferredIdKey).toBe('')
    expect(saved?.actionCaptureHistory).toHaveLength(1)
  })

  it('keeps the stronger exact capture when a later weaker duplicate arrives', () => {
    const first = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'filter_rooms',
      mode: 'observe',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/eoss-meeting/meeting/meetingrooms/getRooms?bookTime=2026-05-14%2000%3A00%3A00&workplace=%E6%AD%A6%E6%B1%89%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83&floor=11&page=1&limit=999',
          method: 'GET',
          responseContentType: 'application/json',
          responsePreview: '{"code":0,"msg":"success","data":{"total":2,"list":[{"id":"1985620980776501249","roomId":"1985620980776501249","roomcode":"1106","meetingInfoMaps":{"2026-05-14T14:30":null}}]}}',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.filter_rooms_draft',
      },
    })

    const second = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'filter_rooms',
      mode: 'observe',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/eoss-meeting/meeting/meetingrooms/getRooms?bookTime=2026-05-14%2000%3A00%3A00&workplace=%E6%AD%A6%E6%B1%89%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83&floor=11&page=1&limit=999',
          method: 'GET',
          responseContentType: 'application/json',
          responsePreview: '{"code":0,"msg":"success","data":{"total":2,"list":[...]}}',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.filter_rooms_draft',
      },
    })

    expect(first?.actionApiCandidates).toHaveLength(1)
    expect(first?.actionCaptureHistory).toHaveLength(1)
    expect(second?.actionApiCandidates).toHaveLength(1)
    expect(second?.actionCaptureHistory).toHaveLength(1)
    expect(second?.actionApiCandidates[0]?.responseHints?.preferredAvailabilityKey).toBe('meetingInfoMaps')
    expect(second?.actionApiCandidates[0]?.responseHints?.availabilityLikeKeys).toContain('meetingInfoMaps')
    expect(second?.actionApiCandidates[0]?.responsePreview).toContain('"meetingInfoMaps"')
    expect(second?.actionCaptureHistory?.[0]?.responsePreview).toContain('"meetingInfoMaps"')
    expect(second?.actionEvidenceSummary?.historyCount).toBe(1)
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.selectedSignals).toContain('response_hints:14')
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.candidates).toHaveLength(1)
  })

  it('keeps the richer same-tool write capture ahead of a weaker later variant', () => {
    const first = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'book_room',
      mode: 'intercept',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/eoss-meeting/meeting/meetinginfo',
          method: 'POST',
          requestBodyPreview: '{"booker":"stevenxu(徐斌)","bookerDept":"stevenxu(徐斌)","roomId":"1985620980776501249","startTime":"2026-05-13 19:00:00","endTime":"2026-05-13 20:00:00","theme":"stevenxu(徐斌)预定的会议室","meetingAttendees":[{"attendeeType":1,"meetingAttendee":"stevenxu(徐斌)","needNotice":1}],"meetingAttachment":[],"needHidden":0,"description":""}',
          intercepted: true,
          blockedReason: 'side-effect-safe-capture',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.book_room_draft',
      },
    })

    const second = saveSiteMemoryFromActionCapture({
      site: 'scheduling.example.com',
      actionName: 'book_room',
      mode: 'intercept',
      workflow: { version: 'opencli-action-capture-v1' },
      capturedActions: [
        {
          url: 'https://scheduling.example.com/api/booking/create',
          method: 'POST',
          requestBodyPreview: '{"roomId":"A101","start":"2026-05-14T15:00:00+08:00"}',
          intercepted: true,
          blockedReason: 'side-effect-safe-capture',
        },
      ],
      recommendation: {
        toolName: 'scheduling.example.com.book_room_draft',
      },
    })

    expect(first?.actionApiCandidates[0]?.url).toBe('https://scheduling.example.com/eoss-meeting/meeting/meetinginfo')
    expect(first?.actionCaptureHistory).toHaveLength(1)
    expect(second?.actionApiCandidates[0]?.toolName).toBe('scheduling.example.com.book_room_draft')
    expect(second?.actionApiCandidates[0]?.url).toBe('https://scheduling.example.com/eoss-meeting/meeting/meetinginfo')
    expect(second?.actionApiCandidates[0]?.requestBodyPreview).toContain('"meetingAttendees"')
    expect(second?.actionCaptureHistory).toHaveLength(2)
    expect(second?.actionCaptureHistory?.some((item) => item.url === 'https://scheduling.example.com/api/booking/create')).toBe(true)
    expect(second?.actionCaptureHistory?.some((item) => item.url === 'https://scheduling.example.com/eoss-meeting/meeting/meetinginfo')).toBe(true)
    expect(second?.actionEvidenceSummary?.historyCount).toBe(2)
    expect(second?.actionEvidenceSummary?.bestViewCount).toBe(1)
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.historyCount).toBe(2)
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.selectedUrl).toBe('https://scheduling.example.com/eoss-meeting/meeting/meetinginfo')
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.selectedSignals).toContain('request_fields:10')
    expect(second?.actionEvidenceSummary?.toolSummaries[0]?.candidates.some((item) => item.selected && item.url.includes('/meetinginfo'))).toBe(true)
  })
})
