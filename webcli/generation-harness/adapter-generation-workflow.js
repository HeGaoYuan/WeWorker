import path from 'node:path';
import { writeScaffoldFromSiteMemory } from '../adapter-scaffold.js';
import { resolveAdaptersDir } from '../paths.js';
import { seedAdapterDraft } from './adapter-workspace.js';
import { GENERATION_STATUSES } from './constants.js';
import { createJsonActionModel } from './json-action-model.js';
import { runToolLoop } from './tool-loop.js';
import { validateAdapterDraft } from './static-validator.js';
import { reviseAdapterDraft } from './draft-revision.js';
import { writeGenerationHarnessProvenance } from './provenance.js';

function summarizeCandidate(candidate, index) {
  let pathname = '';
  let queryKeys = [];
  try {
    const url = new URL(candidate?.url || '');
    pathname = url.pathname;
    queryKeys = [...url.searchParams.keys()].slice(0, 20);
  } catch {
    pathname = String(candidate?.url || '').slice(0, 300);
  }
  return {
    index,
    method: String(candidate?.method || 'GET').toUpperCase(),
    pathname,
    queryKeys,
    actionName: candidate?.actionName || '',
    toolName: candidate?.toolName || '',
    status: candidate?.status,
    responsePreview: String(candidate?.responsePreview || '').slice(0, 800),
  };
}

function buildContextSections(memory) {
  const listCandidates = Array.isArray(memory.listApiCandidates) ? memory.listApiCandidates : [];
  const actionCandidates = Array.isArray(memory.actionApiCandidates) ? memory.actionApiCandidates : [];
  return {
    overview: {
      siteKey: memory.siteKey,
      siteHost: memory.siteHost,
      canonicalEntryUrl: memory.canonicalEntryUrl,
      recommendedStrategy: memory.recommendedStrategy,
      verdictPattern: memory.verdictPattern,
      verdictReason: memory.verdictReason,
      listApiCount: listCandidates.length,
      actionApiCount: actionCandidates.length,
    },
    list_apis: listCandidates.slice(0, 30).map(summarizeCandidate),
    action_apis: actionCandidates.slice(0, 30).map(summarizeCandidate),
  };
}

const PLAN_SYSTEM_PROMPT = `你是 Adapter 生成规划器。你的任务不是直接写代码，而是分析探索结果并保存一份生成计划。

必须遵循：
1. 先调用 inspect_generation_context 查看 overview。
2. 根据 overview 再查看 list_apis 和/或 action_apis。
3. 调用 save_generation_plan 保存计划。
4. 保存成功后输出 final。
5. 查询类工具 risk 必须为 read；提交、修改、删除、审批类工具必须标记为 write。
6. 不要虚构未在上下文中出现的接口。`;

function normalizePlannedToolName(siteKey, value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const prefix = `${siteKey}.`;
  const local = raw.startsWith(prefix)
    ? raw.slice(prefix.length)
    : raw.includes('.') ? raw.split('.').slice(1).join('.') : raw;
  const normalized = local
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized ? `${siteKey}.${normalized}` : fallback;
}

function getListSourceToolName(siteKey, index) {
  if (index === 0) return `${siteKey}.search_records`;
  if (index === 1) return `${siteKey}.fetch_summary_groups`;
  return '';
}

function resolvePlannedSourceTool(memory, tool) {
  const siteKey = memory.siteKey;
  const localName = String(tool?.name || '').split('.').pop().toLowerCase();
  if (localName === 'check_login_status') return `${siteKey}.check_login_status`;

  const indexes = Array.isArray(tool?.sourceApiIndexes)
    ? tool.sourceApiIndexes.map(Number).filter(Number.isInteger)
    : [];
  const actionCandidates = Array.isArray(memory.actionApiCandidates) ? memory.actionApiCandidates : [];
  const matchingAction = actionCandidates.find((candidate) => {
    const candidateLocal = String(candidate?.toolName || '').split('.').pop().toLowerCase();
    return candidateLocal && (candidateLocal === localName || candidateLocal.replace(/_draft$/, '') === localName);
  });

  if (tool?.risk === 'write') {
    if (matchingAction?.toolName) return String(matchingAction.toolName);
    for (const index of indexes) {
      if (actionCandidates[index]?.toolName) return String(actionCandidates[index].toolName);
    }
    return '';
  }

  if (localName === 'search_records') return `${siteKey}.search_records`;
  if (localName === 'fetch_summary_groups') return `${siteKey}.fetch_summary_groups`;
  for (const index of indexes) {
    const sourceToolName = getListSourceToolName(siteKey, index);
    if (sourceToolName) return sourceToolName;
  }
  return Array.isArray(memory.listApiCandidates) && memory.listApiCandidates.length > 0
    ? `${siteKey}.search_records`
    : '';
}

function buildPlanSemanticEnhancement(memory, plan) {
  const overrides = [];
  const seenSources = new Set();
  const seenNames = new Set();
  for (const tool of Array.isArray(plan?.tools) ? plan.tools : []) {
    const sourceToolName = resolvePlannedSourceTool(memory, tool);
    if (!sourceToolName || seenSources.has(sourceToolName)) continue;
    const plannedToolName = normalizePlannedToolName(memory.siteKey, tool?.name, sourceToolName);
    const toolName = seenNames.has(plannedToolName) ? sourceToolName : plannedToolName;
    seenSources.add(sourceToolName);
    seenNames.add(toolName);
    overrides.push({
      sourceToolName,
      toolName,
      description: String(tool?.purpose || '').trim(),
      parameterDescriptions: {},
      parameterUiHints: {},
    });
  }
  const quickPrompts = (Array.isArray(plan?.tools) ? plan.tools : [])
    .slice(0, 3)
    .map((tool) => String(tool?.purpose || tool?.name || '').trim())
    .filter(Boolean)
    .map((purpose) => `帮我${purpose}`);
  return {
    analysisSource: 'harness_plan',
    manifestDescription: String(plan?.summary || '').trim(),
    quickPrompts,
    toolOverrides: overrides,
  };
}

export function createAdapterGenerationWorkflow({
  model = createJsonActionModel(),
  semanticAnalyzer = null,
  scaffoldWriter = writeScaffoldFromSiteMemory,
  staticValidator = validateAdapterDraft,
  adaptersDir = resolveAdaptersDir(),
  runtimeValidator = null,
} = {}) {
  return async ({ run, signal, store }) => {
    const memory = run.snapshot.input?.memory;
    if (!memory?.siteKey) throw new Error('generation run input.memory is required');
    const sections = buildContextSections(memory);
    let plan = null;

    run.assertNotCancelled(signal);
    run.transition(GENERATION_STATUSES.CONTEXT_READY, { currentAction: 'context_ready' });
    run.transition(GENERATION_STATUSES.PLANNING, { currentAction: 'create_generation_plan' });

    const loopResult = await runToolLoop({
      model,
      systemPrompt: PLAN_SYSTEM_PROMPT,
      maxSteps: Math.min(5, run.snapshot.budget.maxSteps),
      signal,
      messages: [{
        role: 'user',
        content: `为 ${memory.siteKey} 制定 API 类 Adapter 生成计划。`,
      }],
      context: { run },
      onEvent: (event) => {
        if (event.type === 'model_started') run.recordModelCall({ phase: 'planning', step: event.step });
        if (event.type === 'tool_started') run.recordStep(event.call.name, { phase: 'planning' });
        run.trace(`tool_loop_${event.type}`, event);
      },
      tools: [
        {
          name: 'inspect_generation_context',
          description: '读取探索结果的指定部分。先读取 overview，再按需读取 API 列表。',
          parameters: {
            type: 'object',
            properties: {
              section: { type: 'string', enum: ['overview', 'list_apis', 'action_apis'] },
            },
            required: ['section'],
            additionalProperties: false,
          },
          execute: async ({ section }) => sections[section],
        },
        {
          name: 'save_generation_plan',
          description: '保存最终 Adapter 生成计划。',
          parameters: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              strategy: { type: 'string', enum: ['api_first', 'hybrid', 'action_only'] },
              tools: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    purpose: { type: 'string' },
                    risk: { type: 'string', enum: ['read', 'write'] },
                    sourceApiIndexes: { type: 'array', items: { type: 'integer' } },
                  },
                  required: ['name', 'purpose', 'risk', 'sourceApiIndexes'],
                  additionalProperties: false,
                },
              },
            },
            required: ['summary', 'strategy', 'tools'],
            additionalProperties: false,
          },
          execute: async (nextPlan) => {
            plan = nextPlan;
            run.setArtifact('plan', nextPlan);
            return { saved: true, toolCount: nextPlan.tools.length };
          },
        },
      ],
    });

    if (!plan) throw new Error('planning loop completed without save_generation_plan');
    run.trace('planning_completed', { plan, loopSteps: loopResult.steps });
    run.assertNotCancelled(signal);
    run.transition(GENERATION_STATUSES.DRAFTING, { currentAction: 'generate_adapter_draft' });

    let semanticEnhancement = buildPlanSemanticEnhancement(memory, plan);
    run.trace('semantic_enhancement_from_plan', {
      toolOverrideCount: semanticEnhancement.toolOverrides.length,
      quickPromptCount: semanticEnhancement.quickPrompts.length,
    });
    if (typeof semanticAnalyzer === 'function') {
      run.recordModelCall({ phase: 'semantic_enhancement' });
      try {
        const analyzed = await semanticAnalyzer({ memory });
        if (analyzed?.analysisSource === 'ai') semanticEnhancement = analyzed;
      } catch (error) {
        run.trace('semantic_enhancement_failed', { message: error.message });
      }
    }
    run.assertNotCancelled(signal);

    const revision = run.snapshot.revisionCount;
    const draftRoot = path.join(store.getDraftRoot(run.id), `revision-${revision}`);
    run.trace('draft_phase', { phase: 'seed_adapter_started', draftRoot });
    const workspace = seedAdapterDraft({
      sourceAdapterDir: path.join(adaptersDir, memory.siteKey),
      draftRoot,
      siteKey: memory.siteKey,
    });
    run.trace('draft_phase', {
      phase: 'seed_adapter_completed',
      seededFromExisting: workspace.seededFromExisting,
      copiedFiles: workspace.copyStats?.fileCount || 0,
      copiedBytes: workspace.copyStats?.totalBytes || 0,
    });
    run.setArtifact('workspace', workspace);
    const memoryForDraft = semanticEnhancement
      ? { ...memory, scaffoldSemanticHints: semanticEnhancement }
      : memory;
    run.trace('draft_phase', { phase: 'scaffold_write_started' });
    const draft = scaffoldWriter(memoryForDraft, { outputRoot: draftRoot });
    run.trace('draft_phase', {
      phase: 'scaffold_write_completed',
      toolCount: draft.toolNames?.length || 0,
    });
    let currentDraft = {
      revision,
      rootDir: draftRoot,
      adapterDir: draft.adapterDir,
      toolNames: draft.toolNames,
      files: draft.files,
      semanticEnhancement: semanticEnhancement ? {
        analysisSource: semanticEnhancement.analysisSource,
        provider: semanticEnhancement.provider,
        model: semanticEnhancement.model,
      } : null,
    };
    run.setArtifact('draft', currentDraft);
    run.setArtifact('draftHistory', [currentDraft]);

    run.transition(GENERATION_STATUSES.STATIC_VALIDATING, { currentAction: 'validate_adapter_draft' });
    run.recordStep('validate_adapter_draft', { phase: 'static_validation' });
    let validation = staticValidator({
      adapterDir: currentDraft.adapterDir,
      expectedSiteKey: memory.siteKey,
      expectedToolNames: draft.toolNames,
    });
    run.setArtifact('staticValidation', validation);
    run.trace('validation_completed', validation);

    const applyRevision = async (feedback) => {
      const revised = await reviseAdapterDraft({
        run,
        signal,
        store,
        model,
        draft: currentDraft,
        validation: feedback,
        staticValidator,
      });
      currentDraft = revised.draft;
      validation = revised.validation;
      const history = Array.isArray(run.snapshot.artifacts.draftHistory)
        ? run.snapshot.artifacts.draftHistory
        : [];
      run.setArtifact('draft', currentDraft);
      run.setArtifact('draftHistory', [...history, { ...currentDraft, writes: revised.writes }]);
      run.transition(GENERATION_STATUSES.STATIC_VALIDATING, {
        currentAction: 'validate_revised_adapter_draft',
        revision: currentDraft.revision,
      });
      run.setArtifact('staticValidation', validation);
      run.trace('validation_completed', validation);
      return revised;
    };

    while (!validation.passed && run.snapshot.revisionCount < run.snapshot.budget.maxRevisions) {
      await applyRevision(validation);
    }

    if (!validation.passed) {
      const error = new Error(`adapter draft failed static validation (${validation.errors.length} errors)`);
      error.code = 'STATIC_VALIDATION_FAILED';
      error.details = validation;
      throw error;
    }

    let runtimeValidation = null;
    if (typeof runtimeValidator === 'function') {
      while (true) {
        run.assertNotCancelled(signal);
        run.transition(GENERATION_STATUSES.RUNTIME_VALIDATING, { currentAction: 'validate_adapter_runtime' });
        run.recordStep('validate_adapter_runtime', { phase: 'runtime_validation' });
        runtimeValidation = await runtimeValidator({
          run,
          signal,
          store,
          draft: currentDraft,
          validation,
          plan,
          memory,
        });
        run.setArtifact('runtimeValidation', runtimeValidation);
        run.trace('runtime_validation_completed', runtimeValidation);
        if (runtimeValidation?.passed) break;
        const runtimeErrorCodes = new Set((runtimeValidation?.errors || []).map((error) => error?.code).filter(Boolean));
        if (runtimeErrorCodes.has('TARGET_TAB_NOT_FOUND') || runtimeErrorCodes.has('LOGIN_REQUIRED') || runtimeErrorCodes.has('LOGIN_OR_HTML_RESPONSE')) {
          run.transition(GENERATION_STATUSES.NEEDS_USER_INPUT, {
            currentAction: 'open_or_login_target_page',
            runtimeErrorCodes: [...runtimeErrorCodes],
          });
          return {
            pause: true,
            status: GENERATION_STATUSES.NEEDS_USER_INPUT,
            plan,
            draft: currentDraft,
            validation,
            runtimeValidation,
          };
        }
        if (run.snapshot.revisionCount >= run.snapshot.budget.maxRevisions) {
          const error = new Error(`adapter draft failed runtime validation (${runtimeValidation?.errors?.length || 0} errors)`);
          error.code = 'RUNTIME_VALIDATION_FAILED';
          error.details = runtimeValidation;
          throw error;
        }
        await applyRevision({
          passed: false,
          validator: runtimeValidation.validator || 'adapter_runtime_validator_v1',
          errors: runtimeValidation.errors || [],
          warnings: runtimeValidation.warnings || [],
          toolResults: runtimeValidation.toolResults || [],
        });
        if (!validation.passed) {
          const error = new Error(`runtime repair introduced static validation errors (${validation.errors.length} errors)`);
          error.code = 'STATIC_VALIDATION_FAILED_AFTER_RUNTIME_REPAIR';
          error.details = validation;
          throw error;
        }
      }
    }

    writeGenerationHarnessProvenance({
      run,
      draft: currentDraft,
      validation,
      runtimeValidation,
      plan,
    });

    run.transition(GENERATION_STATUSES.AWAITING_APPROVAL, { currentAction: 'await_publish_approval' });
    return {
      pause: true,
      status: GENERATION_STATUSES.AWAITING_APPROVAL,
      plan,
      draft: currentDraft,
      validation,
      runtimeValidation,
    };
  };
}
