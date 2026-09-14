import { describe, expect, it } from 'vitest';
import {
  buildApiSourceEvidence,
  createApiCandidateFingerprint,
} from '../generation-harness/index.js';

describe('generation source evidence', () => {
  it('creates the same fingerprint when only captured parameter values change', () => {
    const first = {
      method: 'POST',
      url: 'https://todo.example.com/api/todos?pageSize=20&pageIndex=1',
      requestBodyPreview: '{"keyword":"first"}',
    };
    const second = {
      method: 'POST',
      url: 'https://todo.example.com/api/todos?pageIndex=2&pageSize=50',
      requestBodyPreview: '{"keyword":"second"}',
    };

    expect(createApiCandidateFingerprint(first)).toBe(createApiCandidateFingerprint(second));
  });

  it('classifies selected passive list candidates as reads even when they use POST', () => {
    const evidence = buildApiSourceEvidence({
      method: 'POST',
      url: 'https://todo.example.com/api/todos',
      requestBodyPreview: '{"pageSize":20,"pageIndex":1}',
    }, { sourceKind: 'passive_list' });

    expect(evidence.risk).toMatchObject({
      level: 'read',
      confidence: 0.97,
    });
  });

  it('does not treat every passively observed request as read-only', () => {
    const telemetry = buildApiSourceEvidence({
      method: 'POST',
      url: 'https://todo.example.com/api/analytics/report',
    }, { sourceKind: 'passive_list' });
    const mutation = buildApiSourceEvidence({
      method: 'POST',
      url: 'https://todo.example.com/api/approve/myApprove',
    }, { sourceKind: 'passive_list' });

    expect(telemetry.risk.level).toBe('unknown');
    expect(mutation.risk.level).toBe('write');
  });
});
