import {
  buildApiSourceEvidence,
  classifyApiCandidateRisk,
  createApiCandidateFingerprint,
} from './source-evidence.js';

const WRITE_SIGNAL_RE = /(?:^|[^a-z0-9])(create|add|update|edit|delete|remove|submit|approve|reject|book|cancel|publish|upload|import|run|execute|restart|deploy|set|bind|unbind|confirm|apply|reply)(?:$|[^a-z0-9])/i;
const READ_SIGNAL_RE = /(?:^|[^a-z0-9])(get|list|search|query|fetch|check|describe|inspect|find|read|status|detail|summary)(?:$|[^a-z0-9])/i;
const SENSITIVE_FIELD_RE = /api[_-]?key|authorization|cookie|credential|password|passwd|secret|session|ticket|token|csrf/i;

function candidatePayload(candidate) {
  const values = {};
  try {
    const url = new URL(candidate?.url || '');
    for (const [key, value] of url.searchParams.entries()) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) values[key] = value;
      else if (Array.isArray(values[key])) values[key].push(value);
      else values[key] = [values[key], value];
    }
  } catch {}
  const body = candidate?.requestBodyPreview ?? candidate?.requestBody;
  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(values, parsed);
    } catch {}
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    Object.assign(values, body);
  }
  return values;
}

function valueKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function parseCapturedResponse(candidate) {
  const value = candidate?.responsePreview ?? candidate?.responseBodyPreview ?? candidate?.responseBody;
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeResponseShape(value) {
  const kinds = new Set();
  const visit = (current, depth = 0) => {
    const kind = valueKind(current);
    kinds.add(kind);
    if (depth >= 6 || current == null) return;
    if (Array.isArray(current)) {
      for (const item of current.slice(0, 3)) visit(item, depth + 1);
      return;
    }
    if (typeof current === 'object') {
      for (const child of Object.values(current).slice(0, 30)) visit(child, depth + 1);
    }
  };
  visit(value);
  return {
    rootKind: valueKind(value),
    containsKinds: [...kinds].sort(),
    rootKeys: value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).slice(0, 30).sort()
      : [],
  };
}

function capturedResponseShape(candidate) {
  const parsed = parseCapturedResponse(candidate);
  if (parsed !== null) return summarizeResponseShape(parsed);
  const preview = String(candidate?.responsePreview ?? candidate?.responseBodyPreview ?? '').trim();
  if (preview.startsWith('{') || preview.startsWith('[')) {
    const rootKind = preview.startsWith('[') ? 'array' : 'object';
    return {
      rootKind,
      containsKinds: preview.includes('[') ? ['array', 'object'] : [rootKind],
      rootKeys: [],
    };
  }
  const hints = candidate?.responseHints;
  if (hints && typeof hints === 'object') {
    return {
      rootKind: 'object',
      containsKinds: hints.listPath ? ['array', 'object'] : ['object'],
      rootKeys: [],
    };
  }
  return null;
}

function findCapturedCandidate(tool, memory, fallbackListIndex = 0) {
  const name = String(tool?.name || '');
  const listCandidates = Array.isArray(memory.listApiCandidates) ? memory.listApiCandidates : [];
  const actionCandidates = Array.isArray(memory.actionApiCandidates) ? memory.actionApiCandidates : [];
  const sourceFingerprint = String(tool?.generationSource?.fingerprint || '');
  if (sourceFingerprint) {
    const exactSource = [...listCandidates, ...actionCandidates].find((candidate) => {
      const fingerprint = candidate?.sourceEvidence?.fingerprint || createApiCandidateFingerprint(candidate);
      return fingerprint === sourceFingerprint;
    });
    if (exactSource) return exactSource;
    return null;
  }
  const exactAction = actionCandidates.find((candidate) => candidate?.toolName === name);
  if (exactAction) return exactAction;
  if (/(?:^|\.)search_records$/i.test(name)) return listCandidates[0] || null;
  if (/(?:^|\.)fetch_summary_groups$/i.test(name)) return listCandidates[1] || null;
  return listCandidates[fallbackListIndex] || null;
}

function coerceValue(value, schema = {}) {
  if (schema.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (schema.type === 'integer') {
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
  }
  if (schema.type === 'boolean') {
    if (value === true || value === false) return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return undefined;
  }
  if (schema.type === 'array') return Array.isArray(value) ? value : undefined;
  if (schema.type === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  if (schema.type === 'string') {
    return value != null && typeof value !== 'object' ? String(value) : undefined;
  }
  if (value == null) return undefined;
  return value;
}

export function classifyGeneratedToolRisk({ tool = {}, planTool = null, candidate = null, sourceKind = '' } = {}) {
  const sourceRisk = tool?.generationSource?.risk;
  const sourceFingerprint = String(tool?.generationSource?.fingerprint || '');
  const candidateFingerprint = candidate
    ? candidate?.sourceEvidence?.fingerprint || createApiCandidateFingerprint(candidate)
    : '';
  if (sourceRisk
    && sourceFingerprint
    && sourceFingerprint === candidateFingerprint
    && ['read', 'write', 'unknown'].includes(sourceRisk.level)) {
    return {
      level: sourceRisk.level,
      confidence: Number(sourceRisk.confidence || 0),
      signals: ['source_evidence', ...(sourceRisk.evidence || [])],
    };
  }
  if (candidate && sourceKind) {
    const candidateRisk = candidate?.sourceEvidence?.risk || classifyApiCandidateRisk(candidate, { sourceKind });
    return {
      level: candidateRisk.level,
      confidence: Number(candidateRisk.confidence || 0),
      signals: ['captured_source_evidence', ...(candidateRisk.evidence || [])],
    };
  }
  const name = String(tool.name || planTool?.name || '');
  const description = String(tool.description || planTool?.purpose || '');
  const probe = `${name} ${description}`;
  const signals = [];
  if (planTool?.risk === 'write') signals.push('plan_write');
  if (planTool?.risk === 'read') signals.push('plan_read');
  if (WRITE_SIGNAL_RE.test(probe)) signals.push('write_name_or_description');
  if (READ_SIGNAL_RE.test(probe)) signals.push('read_name_or_description');

  if (signals.includes('plan_write') || signals.includes('write_name_or_description')) {
    return { level: 'write', confidence: 0.99, signals };
  }
  if (signals.includes('plan_read') && signals.includes('read_name_or_description')) {
    return { level: 'read', confidence: 0.95, signals };
  }
  if (signals.includes('plan_read')) return { level: 'read', confidence: 0.82, signals };
  if (signals.includes('read_name_or_description')) return { level: 'read', confidence: 0.76, signals };
  return { level: 'unknown', confidence: 0.4, signals };
}

function normalizedToolLocalName(value) {
  return String(value || '').trim().split('.').pop().replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase();
}

function findPlanTool(tool, planTools) {
  const exact = planTools.find((item) => item.name === tool.name);
  if (exact) return exact;
  const localName = normalizedToolLocalName(tool.name);
  return planTools.find((item) => normalizedToolLocalName(item.name) === localName) || null;
}

export function resolveRuntimeTestArguments({ tool = {}, memory = {}, risk, candidate = null } = {}) {
  const schema = tool.parameters && typeof tool.parameters === 'object'
    ? tool.parameters
    : { type: 'object', properties: {} };
  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const candidates = risk?.level === 'read'
    ? candidate ? [candidate] : [...(memory.listApiCandidates || []), ...(memory.actionApiCandidates || [])]
    : [];
  const payloads = candidates.map(candidatePayload);
  const args = {};
  const sources = {};
  const parameterMismatches = [];

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (SENSITIVE_FIELD_RE.test(key)) continue;
    let value;
    let source = '';
    if (Object.prototype.hasOwnProperty.call(propertySchema, 'default')) {
      value = propertySchema.default;
      source = 'schema_default';
    } else {
      const payload = payloads.find((item) => Object.prototype.hasOwnProperty.call(item, key));
      if (payload) {
        value = payload[key];
        source = 'captured_request';
      }
    }
    const coerced = coerceValue(value, propertySchema);
    if (coerced !== undefined) {
      args[key] = coerced;
      sources[key] = source;
    } else if (source === 'captured_request') {
      parameterMismatches.push({
        parameter: key,
        expectedType: propertySchema.type || 'unknown',
        capturedType: valueKind(value),
      });
    }
  }

  const missingRequired = required.filter((key) => !Object.prototype.hasOwnProperty.call(args, key));
  return {
    ready: risk?.level === 'read'
      && risk.confidence >= 0.75
      && missingRequired.length === 0
      && parameterMismatches.length === 0,
    args,
    sources,
    missingRequired,
    parameterMismatches,
    capturedRequestKeys: Object.keys(payloads[0] || {}).sort(),
  };
}

export function inferOutputContract(_tool = {}, candidate = null) {
  const shape = capturedResponseShape(candidate);
  return shape
    ? { kind: 'captured_sample', capturedShape: shape }
    : { kind: 'json' };
}

export function buildRuntimeTestCases({ registeredTools = [], plan = null, memory = {} } = {}) {
  const planTools = Array.isArray(plan?.tools) ? plan.tools : [];
  let fallbackListIndex = 0;
  return registeredTools.map((tool) => {
    const isLoginUtility = /(?:^|\.)check_login_status$/i.test(String(tool.name || ''));
    const candidate = isLoginUtility ? null : findCapturedCandidate(tool, memory, fallbackListIndex);
    const sourceKind = candidate && (memory.listApiCandidates || []).includes(candidate)
      ? 'passive_list'
      : candidate ? 'action_capture' : '';
    const candidateEvidence = candidate
      ? candidate.sourceEvidence || buildApiSourceEvidence(candidate, { sourceKind })
      : null;
    const toolEvidenceMatches = tool?.generationSource?.version === 'api-source-v1'
      && candidateEvidence
      && tool.generationSource.fingerprint === candidateEvidence.fingerprint;
    const sourceEvidence = toolEvidenceMatches ? tool.generationSource : candidateEvidence;
    const planTool = findPlanTool(tool, planTools);
    const risk = classifyGeneratedToolRisk({ tool, planTool, candidate, sourceKind });
    if (candidate && (memory.listApiCandidates || []).includes(candidate)) fallbackListIndex += 1;
    const argumentsResult = resolveRuntimeTestArguments({ tool, memory, risk, candidate });
    const contract = inferOutputContract(tool, candidate);
    const validationErrors = argumentsResult.parameterMismatches.map((mismatch) => ({
      code: 'CAPTURED_PARAMETER_TYPE_MISMATCH',
      message: `参数 ${mismatch.parameter} 类型不一致：工具声明 ${mismatch.expectedType}，捕获样本为 ${mismatch.capturedType}`,
      parameter: mismatch.parameter,
    }));
    const hasCapturedContract = contract.kind === 'captured_sample';
    const execute = !isLoginUtility && argumentsResult.ready && hasCapturedContract;
    return {
      toolName: tool.name,
      risk,
      sourceEvidence,
      arguments: argumentsResult.args,
      argumentSources: argumentsResult.sources,
      capturedRequestKeys: argumentsResult.capturedRequestKeys,
      missingRequired: argumentsResult.missingRequired,
      validationErrors,
      contract,
      execute,
      skipReason: execute
        ? ''
        : isLoginUtility
          ? 'login_status_utility_not_runtime_tested'
          : risk.level !== 'read' || risk.confidence < 0.75
          ? 'tool_is_not_high_confidence_read_only'
          : validationErrors.length > 0
            ? 'captured_parameter_type_mismatch'
            : argumentsResult.missingRequired.length > 0
              ? 'missing_safe_test_arguments'
              : 'missing_captured_response_sample',
    };
  });
}
