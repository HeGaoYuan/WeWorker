import fs from 'node:fs';
import path from 'node:path';

export const GENERATION_HARNESS_VERSION = 'adapter-generation-harness-v1';

export function writeGenerationHarnessProvenance({ run, draft, validation, runtimeValidation, plan }) {
  const manifestPath = draft?.files?.manifest || path.join(draft.adapterDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const provenance = {
    version: GENERATION_HARNESS_VERSION,
    mode: 'smart',
    run_id: run.id,
    generated_at: new Date().toISOString(),
    revision_count: Number(run.snapshot.revisionCount || 0),
    plan_tool_count: Array.isArray(plan?.tools) ? plan.tools.length : 0,
    static_validation: {
      passed: Boolean(validation?.passed),
      validator: validation?.validator || '',
      checked_files: Number(validation?.checkedFiles || 0),
    },
    runtime_validation: runtimeValidation ? {
      passed: Boolean(runtimeValidation.passed),
      validator: runtimeValidation.validator || '',
      attempted: Number(runtimeValidation.executionSummary?.attempted || 0),
      passed_tools: Number(runtimeValidation.executionSummary?.passed || 0),
      skipped: Number(runtimeValidation.executionSummary?.skipped || 0),
    } : null,
  };
  manifest.generation_harness = provenance;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  run.setArtifact('provenance', provenance);
  return provenance;
}
