import fs from 'node:fs';
import path from 'node:path';
import { GENERATION_STATUSES } from './constants.js';
import { runToolLoop } from './tool-loop.js';
import { copyAdapterDirectorySafe } from './adapter-workspace.js';

const ALLOWED_DRAFT_FILE_RE = /\.(?:js|json|md|txt)$/i;
const MAX_DRAFT_FILE_CHARS = 200_000;

function resolveDraftFile(adapterDir, relativePath, { mustExist = true } = {}) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized || path.isAbsolute(normalized) || !ALLOWED_DRAFT_FILE_RE.test(normalized)) {
    throw new Error(`draft file path is not allowed: ${relativePath}`);
  }
  const absoluteAdapterDir = path.resolve(adapterDir);
  const filePath = path.resolve(absoluteAdapterDir, normalized);
  const relative = path.relative(absoluteAdapterDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`draft file escapes adapter directory: ${relativePath}`);
  }
  if (mustExist && !fs.existsSync(filePath)) throw new Error(`draft file not found: ${normalized}`);
  return { normalized, filePath };
}

function listDraftFiles(adapterDir) {
  const result = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (entry.isFile() && ALLOWED_DRAFT_FILE_RE.test(entry.name)) {
        result.push(path.relative(adapterDir, filePath).replace(/\\/g, '/'));
      }
    }
  };
  walk(adapterDir);
  return result.sort().slice(0, 200);
}

function cloneDraftRevision({ previousAdapterDir, nextDraftRoot, siteKey }) {
  const nextAdapterDir = path.join(nextDraftRoot, siteKey);
  fs.mkdirSync(nextDraftRoot, { recursive: true });
  copyAdapterDirectorySafe(previousAdapterDir, nextAdapterDir);
  return nextAdapterDir;
}

function remapDraftFiles(files, previousAdapterDir, nextAdapterDir) {
  if (!files || typeof files !== 'object') return files;
  return Object.fromEntries(Object.entries(files).map(([key, value]) => {
    if (typeof value !== 'string' || !path.isAbsolute(value)) return [key, value];
    const relative = path.relative(previousAdapterDir, value);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return [key, value];
    return [key, path.join(nextAdapterDir, relative)];
  }));
}

const REVISION_SYSTEM_PROMPT = `你是 Adapter 草稿修复器，只能在隔离草稿中修复结构化验证错误。

必须遵循：
1. 先调用 inspect_validation_errors。错误可能来自静态验证或真实页面运行验证。
2. 使用 list_draft_files 和 read_draft_file 定位错误。
3. 只修改解决验证错误所需的文件，禁止改变无关业务逻辑。
4. 修改后必须调用 validate_adapter_draft。
5. 只有 validate_adapter_draft 返回 passed=true 后才能输出 final。
6. 不得创建目录，不得访问草稿目录外的文件。`;

export async function reviseAdapterDraft({
  run,
  signal,
  store,
  model,
  draft,
  validation,
  staticValidator,
}) {
  run.recordRevision({ validationErrors: validation.errors?.length || 0 });
  const revision = run.snapshot.revisionCount;
  const nextDraftRoot = path.join(store.getDraftRoot(run.id), `revision-${revision}`);
  const adapterDir = cloneDraftRevision({
    previousAdapterDir: draft.adapterDir,
    nextDraftRoot,
    siteKey: run.snapshot.siteKey,
  });
  let latestValidation = validation;
  const writes = [];

  run.transition(GENERATION_STATUSES.REVISING, { currentAction: 'revise_adapter_draft', revision });
  const loopResult = await runToolLoop({
    model,
    systemPrompt: REVISION_SYSTEM_PROMPT,
    maxSteps: 6,
    signal,
    messages: [{
      role: 'user',
      content: `修复 revision-${revision - 1} 的静态验证错误，并确保草稿重新通过验证。`,
    }],
    onEvent: (event) => {
      if (event.type === 'model_started') run.recordModelCall({ phase: 'revision', revision, step: event.step });
      if (event.type === 'tool_started') run.recordStep(event.call.name, { phase: 'revision', revision });
      run.trace(`revision_loop_${event.type}`, event);
    },
    tools: [
      {
        name: 'inspect_validation_errors',
        description: '读取当前草稿的结构化验证错误，包括静态或真实运行错误。',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => latestValidation,
      },
      {
        name: 'list_draft_files',
        description: '列出隔离 Adapter 草稿中允许读取和修改的文件。',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => ({ files: listDraftFiles(adapterDir) }),
      },
      {
        name: 'read_draft_file',
        description: '读取隔离草稿中的一个现有文件。',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        },
        execute: async ({ path: relativePath }) => {
          const resolved = resolveDraftFile(adapterDir, relativePath);
          const content = fs.readFileSync(resolved.filePath, 'utf8');
          return { path: resolved.normalized, content: content.slice(0, MAX_DRAFT_FILE_CHARS) };
        },
      },
      {
        name: 'write_draft_file',
        description: '替换隔离草稿中的一个现有文件。只能修复验证错误。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['path', 'content', 'reason'],
          additionalProperties: false,
        },
        execute: async ({ path: relativePath, content, reason }) => {
          if (content.length > MAX_DRAFT_FILE_CHARS) throw new Error('draft file content is too large');
          const resolved = resolveDraftFile(adapterDir, relativePath);
          fs.writeFileSync(resolved.filePath, content, 'utf8');
          writes.push({ path: resolved.normalized, reason });
          return { written: true, path: resolved.normalized };
        },
      },
      {
        name: 'validate_adapter_draft',
        description: '重新执行确定性静态验证。',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => {
          latestValidation = staticValidator({
            adapterDir,
            expectedSiteKey: run.snapshot.siteKey,
            expectedToolNames: draft.toolNames,
          });
          return latestValidation;
        },
      },
    ],
  });

  latestValidation = staticValidator({
    adapterDir,
    expectedSiteKey: run.snapshot.siteKey,
    expectedToolNames: draft.toolNames,
  });
  return {
    draft: {
      ...draft,
      revision,
      rootDir: nextDraftRoot,
      adapterDir,
      files: remapDraftFiles(draft.files, draft.adapterDir, adapterDir),
    },
    validation: latestValidation,
    writes,
    loopSteps: loopResult.steps,
  };
}

export function resolveAdapterDraftFile(adapterDir, relativePath, options) {
  return resolveDraftFile(adapterDir, relativePath, options);
}
