import path from 'node:path';
import { resolveAdaptersDir } from '../paths.js';
import { publishAdapterDraft } from './adapter-workspace.js';

export function createAdapterPublisher({ adaptersDir = resolveAdaptersDir() } = {}) {
  return async ({ run, store }) => {
    const draft = run.snapshot.artifacts?.draft;
    const workspace = run.snapshot.artifacts?.workspace;
    const validation = run.snapshot.artifacts?.staticValidation;
    if (!draft?.adapterDir) throw new Error('generation run does not contain a draft adapter');
    if (!validation?.passed) throw new Error('generation run draft has not passed static validation');
    if (!workspace?.sourceFingerprint) throw new Error('generation run is missing source adapter fingerprint');

    const result = publishAdapterDraft({
      adaptersDir,
      siteKey: run.snapshot.siteKey,
      draftAdapterDir: draft.adapterDir,
      expectedSourceFingerprint: workspace.sourceFingerprint,
      backupRoot: path.join(store.getRunDir(run.id), 'backup'),
      runId: run.id,
    });
    run.setArtifact('publishedAdapter', result);
    return {
      siteKey: run.snapshot.siteKey,
      toolNames: draft.toolNames || [],
      ...result,
    };
  };
}
