import { describe, expect, it } from 'vitest';
import {
  createGenerationEventTransport,
  createGenerationRunTransportSnapshot,
} from '../generation-transport.js';

describe('generation transport', () => {
  it('keeps persisted detail out of Bridge/UI run snapshots', () => {
    const transported = createGenerationRunTransportSnapshot({
      id: 'run-1',
      status: 'awaiting_approval',
      input: {
        tabId: 8,
        memory: { responsePreview: 'x'.repeat(100_000) },
      },
      artifacts: {
        plan: { tools: [] },
        draft: { toolNames: ['example.test.search'] },
        draftHistory: [{ source: 'x'.repeat(100_000) }],
        workspace: { sourceFingerprint: 'secret-internal-detail' },
        previewAdapter: { previewBundle: 'large' },
      },
      result: { pause: true, duplicate: 'x'.repeat(100_000) },
    });

    expect(transported.input).toEqual({ tabId: 8 });
    expect(transported.artifacts.plan).toEqual({ tools: [] });
    expect(transported.artifacts.draft).toEqual({ toolNames: ['example.test.search'] });
    expect(transported.artifacts).not.toHaveProperty('draftHistory');
    expect(transported.artifacts).not.toHaveProperty('workspace');
    expect(transported.artifacts).not.toHaveProperty('previewAdapter');
    expect(transported.result).toBeNull();
  });

  it('removes large diagnostic payloads from live events', () => {
    const event = createGenerationEventTransport({
      timestamp: '2026-07-24T00:00:00.000Z',
      runId: 'run-1',
      type: 'artifact_updated',
      data: { value: 'x'.repeat(100_000) },
    });

    expect(event).toEqual({
      timestamp: '2026-07-24T00:00:00.000Z',
      runId: 'run-1',
      type: 'artifact_updated',
      data: {},
    });
  });
});
