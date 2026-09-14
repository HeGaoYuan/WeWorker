import { describe, expect, it, vi } from 'vitest';
import { createJsonActionModel, parseJsonActionResponse } from '../generation-harness/index.js';

describe('JSON action model adapter', () => {
  it('parses fenced and plain JSON actions', () => {
    expect(parseJsonActionResponse('```json\n{"type":"final","content":"ok"}\n```')).toEqual({
      type: 'final',
      content: 'ok',
    });
    expect(parseJsonActionResponse('prefix {"type":"tool_call","name":"inspect","arguments":{}} suffix'))
      .toMatchObject({ type: 'tool_call', name: 'inspect' });
  });

  it('builds a constrained tool-loop prompt', async () => {
    const callModel = vi.fn().mockResolvedValue({
      text: '{"type":"tool_call","name":"inspect","arguments":{}}',
    });
    const model = createJsonActionModel({ callModel });
    const result = await model({
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'start' }],
      tools: [{ name: 'inspect', parameters: { type: 'object' } }],
      step: 1,
    });

    expect(result.name).toBe('inspect');
    expect(callModel.mock.calls[0][0].prompt).toContain('你每次只能输出一个 JSON 对象');
    expect(callModel.mock.calls[0][0].prompt).toContain('inspect');
  });
});
