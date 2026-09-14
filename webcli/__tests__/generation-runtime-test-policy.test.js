import { describe, expect, it } from 'vitest';
import {
  buildApiSourceEvidence,
  buildRuntimeTestCases,
  classifyGeneratedToolRisk,
  resolveRuntimeTestArguments,
} from '../generation-harness/index.js';

describe('generation runtime test policy', () => {
  it('allows high-confidence reads and blocks mutation-like tools', () => {
    expect(classifyGeneratedToolRisk({
      tool: { name: 'example.test.search_records', description: '查询记录' },
      planTool: { risk: 'read' },
    })).toMatchObject({ level: 'read', confidence: 0.95 });

    expect(classifyGeneratedToolRisk({
      tool: { name: 'example.test.delete_record', description: '删除记录' },
      planTool: { risk: 'read' },
    })).toMatchObject({ level: 'write' });

    expect(classifyGeneratedToolRisk({
      tool: { name: 'todo.example.com.todo_list', description: '查询待办列表' },
    })).toMatchObject({ level: 'read', confidence: 0.76 });
  });

  it('uses schema defaults and captured request values without inventing required arguments', () => {
    const result = resolveRuntimeTestArguments({
      risk: { level: 'read', confidence: 0.95 },
      tool: {
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            page: { type: 'number', default: 1 },
            unknownId: { type: 'string' },
          },
          required: ['keyword', 'page', 'unknownId'],
        },
      },
      memory: {
        listApiCandidates: [{ url: 'https://example.test/api/search?keyword=room' }],
      },
    });

    expect(result.args).toEqual({ keyword: 'room', page: 1 });
    expect(result.missingRequired).toEqual(['unknownId']);
    expect(result.ready).toBe(false);
  });

  it('builds executable cases only for safe tools with complete arguments', () => {
    const cases = buildRuntimeTestCases({
      registeredTools: [
        {
          name: 'example.test.check_login_status',
          description: '检查登录状态',
          parameters: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'example.test.search_records',
          description: '查询记录',
          parameters: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'example.test.submit_record',
          description: '提交记录',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      ],
      plan: {
        tools: [
          { name: 'example.test.search_records', risk: 'read' },
          { name: 'example.test.submit_record', risk: 'write' },
        ],
      },
      memory: {
        listApiCandidates: [{
          url: 'https://example.test/api/search?page=1',
          responsePreview: '{"code":0,"data":{"records":[{"id":1}]}}',
        }],
      },
    });

    expect(cases[0]).toMatchObject({
      execute: false,
      skipReason: 'login_status_utility_not_runtime_tested',
    });
    expect(cases[1]).toMatchObject({
      execute: true,
      contract: {
        kind: 'captured_sample',
        capturedShape: { rootKind: 'object', containsKinds: ['array', 'number', 'object'] },
      },
    });
    expect(cases[2]).toMatchObject({ execute: false, risk: { level: 'write' } });
  });

  it('reports generated parameter types that cannot accept the captured sample', () => {
    const [testCase] = buildRuntimeTestCases({
      registeredTools: [{
        name: 'example.test.search_records',
        description: '查询记录',
        parameters: {
          type: 'object',
          properties: { filters: { type: 'array' } },
          required: ['filters'],
        },
      }],
      memory: {
        listApiCandidates: [{
          url: 'https://example.test/api/search?filters=active',
          responsePreview: '{"data":[]}',
        }],
      },
    });

    expect(testCase).toMatchObject({
      execute: false,
      skipReason: 'captured_parameter_type_mismatch',
      validationErrors: [{ code: 'CAPTURED_PARAMETER_TYPE_MISMATCH', parameter: 'filters' }],
    });
  });

  it('executes the same passive list interface regardless of the generated tool name', () => {
    const candidate = {
      url: 'https://todo.example.com/api/todos?pageSize=20&pageIndex=1',
      method: 'POST',
      responsePreview: '{"code":0,"data":{"records":[{"id":1}]}}',
    };
    const [testCase] = buildRuntimeTestCases({
      registeredTools: [{
        name: 'todo.example.com.todo_list',
        description: '查询待办列表',
        parameters: {
          type: 'object',
          properties: {
            pageSize: { type: 'integer', default: 20 },
            pageIndex: { type: 'integer', default: 1 },
          },
          required: [],
        },
      }],
      plan: { tools: [{ name: 'todo.example.com.list_todos', risk: 'read' }] },
      memory: { listApiCandidates: [candidate] },
    });

    expect(testCase).toMatchObject({
      execute: true,
      risk: { level: 'read', confidence: 0.97 },
      sourceEvidence: {
        version: 'api-source-v1',
        fingerprint: expect.stringMatching(/^api-v1-/),
        sourceKind: 'passive_list',
        risk: expect.objectContaining({ level: 'read' }),
      },
      arguments: { pageSize: 20, pageIndex: 1 },
      contract: { kind: 'captured_sample' },
    });
  });

  it('keeps captured approval interfaces classified as writes', () => {
    const [testCase] = buildRuntimeTestCases({
      registeredTools: [{
        name: 'todo.example.com.approve_todo',
        description: '审批待办',
        parameters: { type: 'object', properties: {}, required: [] },
      }],
      memory: {
        actionApiCandidates: [{
          toolName: 'todo.example.com.approve_todo',
          actionName: '审批待办',
          method: 'POST',
          url: 'https://todo.example.com/api/approve/myApprove',
          responsePreview: '{"code":0}',
        }],
      },
    });

    expect(testCase).toMatchObject({
      execute: false,
      skipReason: 'tool_is_not_high_confidence_read_only',
      risk: { level: 'write' },
    });
  });

  it('matches captured samples by interface fingerprint instead of tool order or name', () => {
    const first = {
      method: 'GET',
      url: 'https://example.test/api/first?cursor=wrong',
      responsePreview: '{"data":{"records":[]}}',
    };
    const second = {
      method: 'GET',
      url: 'https://example.test/api/second?cursor=correct',
      responsePreview: '{"data":{"records":[{"id":2}]}}',
    };
    const [testCase] = buildRuntimeTestCases({
      registeredTools: [{
        name: 'example.test.any_model_generated_name',
        description: '模型任意命名',
        generationSource: buildApiSourceEvidence(second, { sourceKind: 'passive_list' }),
        parameters: {
          type: 'object',
          properties: { cursor: { type: 'string' } },
          required: ['cursor'],
        },
      }],
      memory: { listApiCandidates: [first, second] },
    });

    expect(testCase).toMatchObject({
      execute: true,
      arguments: { cursor: 'correct' },
      argumentSources: { cursor: 'captured_request' },
      sourceEvidence: { endpoint: 'https://example.test/api/second' },
    });
  });

  it('does not trust source risk metadata when its fingerprint has no captured match', () => {
    const [testCase] = buildRuntimeTestCases({
      registeredTools: [{
        name: 'example.test.todo_list',
        description: '查询列表',
        generationSource: {
          version: 'api-source-v1',
          fingerprint: 'api-v1-unmatched',
          sourceKind: 'passive_list',
          risk: { level: 'read', confidence: 1, evidence: ['claimed_read'] },
        },
        parameters: { type: 'object', properties: {}, required: [] },
      }],
      memory: {
        listApiCandidates: [{
          method: 'GET',
          url: 'https://example.test/api/actual',
          responsePreview: '{"data":[]}',
        }],
      },
    });

    expect(testCase.execute).toBe(false);
    expect(testCase.sourceEvidence).toBeNull();
    expect(testCase.skipReason).toBe('missing_captured_response_sample');
  });
});
