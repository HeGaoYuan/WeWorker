import { describe, expect, it } from 'vitest'
import { deriveSiteMemoryFromWorkflow } from '../site-memory.js'

describe('deriveSiteMemoryFromWorkflow', () => {
  it('extracts stable memory fields from a v12-style exploration result', () => {
    const memory = deriveSiteMemoryFromWorkflow({
      tabId: 123,
      opened: { url: 'https://itsm.example.com' },
      pageStateBefore: { url: 'https://itsm.example.com/itsm/web/index.html#/' },
      resultPageState: {
        url: 'https://itsm.example.com/itsm/request/index.html#/globalSearch?keyword=test',
        listCandidates: 5,
        paginationCandidates: 10,
      },
      pageStateAfter: {
        url: 'https://itsm.example.com/itsm/request/index.html#/globalSearch?keyword=test',
      },
      verdict: {
        pattern: 'api_driven',
        recommendedStrategy: 'COOKIE_API',
        reason: 'best candidate is /itsm/getCiGroup.spr',
      },
      workflow: {
        version: 'opencli-like-v12',
      },
      actions: [
        {
          step: 'search',
          result: { executed: true, action: 'search_enter', value: 'test' },
          networkDelta: {
            entries: [
              {
                url: 'https://itsm.example.com/itsm/getCiGroup.spr',
                method: 'POST',
                requestBodyPreview: 'keyword=test&history=lastYear',
              },
              {
                url: 'https://itsm.example.com/itsm/getCiList.spr',
                method: 'POST',
                requestBodyPreview: 'keyword=test&typeId=&currentPage=1&pageSize=20&history=lastYear',
              },
            ],
          },
        },
        {
          step: 'pagination',
          result: {
            executed: true,
            mode: 'dispatch_click',
            verified: false,
            targetPage: 2,
            activePageBefore: 1,
            activePageAfter: 1,
            reason: 'next-page-not-confirmed',
          },
          networkDelta: { entries: [] },
        },
        {
          step: 'detail',
          result: {
            executed: false,
            action: 'detail_inspect_only',
            mode: 'inspect_only',
            reason: 'detail-navigation-skipped-permission-safe',
            bestCandidate: {
              href: 'https://itsm.example.com/itsm/request/index.html#/requestDetail/12419957',
              text: '[12419957] test ticket',
            },
            networkDetailCandidates: [
              'https://itsm.example.com/itsm/request/index.html#/requestDetail/12419957',
            ],
          },
        },
      ],
    })

    expect(memory).not.toBeNull()
    expect(memory?.siteKey).toBe('itsm.example.com')
    expect(memory?.workflowVersion).toBe('opencli-like-v12')
    expect(memory?.canonicalResultUrl).toContain('/globalSearch?keyword=test')
    expect(memory?.listApiCandidates.map((item) => item.url)).toEqual([
      'https://itsm.example.com/itsm/getCiGroup.spr',
      'https://itsm.example.com/itsm/getCiList.spr',
    ])
    expect(memory?.actionApiCandidates).toEqual([])
    expect(memory?.detailHints.mode).toBe('inspect_only')
    expect(memory?.detailHints.bestCandidateHref).toContain('/requestDetail/12419957')
    expect(memory?.pagination.verified).toBe(false)
    expect(memory?.pagination.targetPage).toBe(2)
  })
})
