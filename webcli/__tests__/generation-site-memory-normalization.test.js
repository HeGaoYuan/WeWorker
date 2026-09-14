import { describe, expect, it } from 'vitest';
import { normalizeSiteMemoryForScaffold } from '../bridge.js';

describe('generation site-memory normalization', () => {
  it('preserves list response samples and backfills legacy captured responses', () => {
    const normalized = normalizeSiteMemoryForScaffold({
      siteKey: 'example.test',
      listApiCandidates: [{
        method: 'GET',
        url: 'https://example.test/api/search?page=1',
        requestBodyPreview: '',
      }],
      apiCandidates: [{
        method: 'GET',
        url: 'https://example.test/api/search?page=1',
        status: 200,
        contentType: 'application/json',
        responsePreview: '{"code":0,"data":{"records":[]}}',
      }],
    });

    expect(normalized.listApiCandidates).toEqual([expect.objectContaining({
      status: 200,
      responseContentType: 'application/json',
      responsePreview: '{"code":0,"data":{"records":[]}}',
      sourceEvidence: expect.objectContaining({
        version: 'api-source-v1',
        sourceKind: 'passive_list',
        risk: expect.objectContaining({ level: 'read', confidence: 0.97 }),
      }),
    })]);
  });

  it('keeps response samples already attached to list candidates', () => {
    const normalized = normalizeSiteMemoryForScaffold({
      siteKey: 'example.test',
      listApiCandidates: [{
        method: 'POST',
        url: 'https://example.test/api/query',
        requestBodyPreview: '{"page":1}',
        responsePreview: '[{"id":1}]',
        responseContentType: 'application/json',
      }],
    });

    expect(normalized.listApiCandidates[0]).toMatchObject({
      requestBodyPreview: '{"page":1}',
      responsePreview: '[{"id":1}]',
      responseContentType: 'application/json',
      sourceEvidence: {
        version: 'api-source-v1',
        fingerprint: expect.stringMatching(/^api-v1-/),
        sourceKind: 'passive_list',
        method: 'POST',
        endpoint: 'https://example.test/api/query',
        queryKeys: [],
        bodyKeys: ['page'],
        risk: expect.objectContaining({ level: 'read', confidence: 0.97 }),
      },
    });
  });

  it('persists write evidence for interfaces captured from user actions', () => {
    const normalized = normalizeSiteMemoryForScaffold({
      siteKey: 'todo.example.com',
      actionApiCandidates: [{
        actionName: '审批待办',
        toolName: 'todo.example.com.approve_todo',
        method: 'POST',
        url: 'https://todo.example.com/api/approve/myApprove',
        requestBodyPreview: '{"todoId":"1"}',
      }],
    });

    expect(normalized.actionApiCandidates[0].sourceEvidence).toMatchObject({
      sourceKind: 'action_capture',
      method: 'POST',
      endpoint: 'https://todo.example.com/api/approve/myApprove',
      bodyKeys: ['todoId'],
      risk: { level: 'write', confidence: 0.99 },
    });
  });
});
