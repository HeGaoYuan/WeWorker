import fs from 'node:fs';
import path from 'node:path';
import { buildRuntimeTestCases } from './runtime-test-policy.js';

const MAX_PREVIEW_SCRIPT_CHARS = 1_000_000;
const SAFE_PREVIEW_SCRIPT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.js$/;

function createPreviewAdapterId(runId) {
  const token = String(runId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!token) throw new Error('runId is required for preview validation');
  return `generation_preview_${token}`;
}

function resolvePreviewScript(adapterDir, relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!SAFE_PREVIEW_SCRIPT_RE.test(normalized) || normalized.includes('..')) {
    throw new Error(`preview script path is not allowed: ${relativePath}`);
  }
  const root = path.resolve(adapterDir);
  const filePath = path.resolve(root, normalized);
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`preview script escapes adapter directory: ${relativePath}`);
  }
  if (!fs.existsSync(filePath)) throw new Error(`preview script not found: ${normalized}`);
  return { path: normalized, filePath };
}

function buildInlinePreviewBundle(adapterDir) {
  const manifestPath = path.join(adapterDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`preview manifest not found in draft: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const supportFiles = Array.isArray(manifest.support_files) ? manifest.support_files : [];
  const scriptPaths = [...new Set([...supportFiles, 'index.js'])];
  let totalChars = 0;
  const scripts = scriptPaths.map((relativePath) => {
    const resolved = resolvePreviewScript(adapterDir, relativePath);
    const source = fs.readFileSync(resolved.filePath, 'utf8');
    totalChars += source.length;
    if (totalChars > MAX_PREVIEW_SCRIPT_CHARS) {
      throw new Error(`preview scripts exceed ${MAX_PREVIEW_SCRIPT_CHARS} characters`);
    }
    return { path: resolved.path, source };
  });
  return { manifest, scripts };
}

export function createPreviewRuntimeValidator({ requestExtension } = {}) {
  if (typeof requestExtension !== 'function') throw new Error('runtime validator requires requestExtension');
  return async ({ run, draft, signal, plan, memory }) => {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const preview = {
      previewAdapterId: createPreviewAdapterId(run.id),
      transport: 'inline_bundle',
    };
    const previewBundle = buildInlinePreviewBundle(draft.adapterDir);
    run.setArtifact('previewAdapter', preview);
    try {
      const registration = await requestExtension({
        type: 'validate_generation_preview',
        previewAdapterId: preview.previewAdapterId,
        previewBundle,
        siteKey: run.snapshot.siteKey,
        tabId: run.snapshot.input?.tabId,
        expectedToolNames: draft.toolNames || [],
      }, 45_000);
      if (!registration?.passed) {
        return { validator: 'adapter_runtime_validator_v1', ...registration };
      }
      const testCases = buildRuntimeTestCases({
        registeredTools: registration.tools || [],
        plan,
        memory,
      });
      const execution = await requestExtension({
        type: 'validate_generation_preview',
        previewAdapterId: preview.previewAdapterId,
        previewBundle,
        siteKey: run.snapshot.siteKey,
        tabId: run.snapshot.input?.tabId,
        expectedToolNames: draft.toolNames || [],
        testCases,
      }, 60_000);
      return {
        validator: 'adapter_runtime_validator_v1',
        ...execution,
        registration,
        testCases,
      };
    } finally {
      run.setArtifact('previewAdapter', null);
    }
  };
}
