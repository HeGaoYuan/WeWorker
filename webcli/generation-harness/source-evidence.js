import { createHash } from 'node:crypto';

const WRITE_API_SIGNAL_RE = /approve|reject|delete|remove|update|edit|submit|create|add|cancel|publish|confirm|apply|save|write|mutation|审批|批准|驳回|删除|修改|提交|创建|新增|取消|发布|确认|更新/i;
const READ_API_SIGNAL_RE = /(?:^|[^a-z])(get|list|search|query|fetch|check|find|read|status|detail|summary|page)(?:$|[^a-z])|查询|列表|搜索|获取|读取|查看|详情|状态|分页|待办/i;
const SYSTEM_API_SIGNAL_RE = /analytics|telemetry|tracking|track|heartbeat|beacon|report|refresh.?token|session|mark.?read|埋点|心跳|上报|刷新令牌|标记已读/i;

function parseBodyKeys(candidate) {
  const body = candidate?.requestBodyPreview ?? candidate?.requestBody;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return Object.keys(body).sort();
  }
  const text = String(body || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed).sort();
    }
  } catch {}
  try {
    return [...new Set([...new URLSearchParams(text).keys()])].sort();
  } catch {
    return [];
  }
}

export function normalizeApiEndpoint(candidate = {}) {
  const method = String(candidate.method || 'GET').toUpperCase();
  let endpoint = String(candidate.url || '').trim();
  let queryKeys = [];
  try {
    const url = new URL(endpoint);
    endpoint = `${url.protocol}//${url.host}${url.pathname}`;
    queryKeys = [...new Set([...url.searchParams.keys()])].sort();
  } catch {}
  return {
    method,
    endpoint,
    queryKeys,
    bodyKeys: parseBodyKeys(candidate),
  };
}

export function createApiCandidateFingerprint(candidate = {}) {
  const normalized = normalizeApiEndpoint(candidate);
  const identity = JSON.stringify(normalized);
  return `api-v1-${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

export function classifyApiCandidateRisk(candidate = {}, { sourceKind = '' } = {}) {
  const normalized = normalizeApiEndpoint(candidate);
  const probe = [
    normalized.endpoint,
    candidate.actionName,
    candidate.toolName,
    candidate.description,
  ].filter(Boolean).join(' ');
  const evidence = [`source:${sourceKind || 'unknown'}`, `method:${normalized.method}`];

  if (SYSTEM_API_SIGNAL_RE.test(probe)) {
    return { level: 'unknown', confidence: 0.2, evidence: [...evidence, 'system_or_telemetry_signal'] };
  }
  if (WRITE_API_SIGNAL_RE.test(probe)) {
    return { level: 'write', confidence: 0.99, evidence: [...evidence, 'mutation_signal'] };
  }
  if (sourceKind === 'passive_list') {
    return {
      level: 'read',
      confidence: 0.97,
      evidence: [...evidence, 'passive_exploration_list_candidate'],
    };
  }
  if (READ_API_SIGNAL_RE.test(probe)) {
    return { level: 'read', confidence: 0.92, evidence: [...evidence, 'query_signal'] };
  }
  if (normalized.method === 'GET' || normalized.method === 'HEAD') {
    return { level: 'read', confidence: 0.86, evidence: [...evidence, 'safe_http_method'] };
  }
  if (sourceKind === 'action_capture') {
    return { level: 'write', confidence: 0.88, evidence: [...evidence, 'captured_user_action_non_read'] };
  }
  return { level: 'unknown', confidence: 0.4, evidence };
}

export function buildApiSourceEvidence(candidate = {}, { sourceKind = '' } = {}) {
  const normalized = normalizeApiEndpoint(candidate);
  return {
    version: 'api-source-v1',
    fingerprint: createApiCandidateFingerprint(candidate),
    sourceKind,
    method: normalized.method,
    endpoint: normalized.endpoint,
    queryKeys: normalized.queryKeys,
    bodyKeys: normalized.bodyKeys,
    risk: classifyApiCandidateRisk(candidate, { sourceKind }),
  };
}
