import { describe, expect, it, vi } from 'vitest';
import { runToolLoop, ToolRegistry } from '../generation-harness/index.js';

describe('generation tool loop', () => {
  it('executes domain tools until the model returns final', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        type: 'tool_call',
        id: 'call-1',
        name: 'inspect_context',
        arguments: { section: 'apis' },
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        id: 'call-2',
        name: 'save_plan',
        arguments: { tools: ['example.test.search_records'] },
      })
      .mockResolvedValueOnce({ type: 'final', content: 'plan ready', data: { planId: 'plan-1' } });

    const savedPlans = [];
    const result = await runToolLoop({
      model,
      messages: [{ role: 'user', content: 'generate adapter' }],
      tools: [
        {
          name: 'inspect_context',
          description: 'Inspect captured APIs',
          parameters: {
            type: 'object',
            properties: { section: { type: 'string' } },
            required: ['section'],
            additionalProperties: false,
          },
          execute: async ({ section }) => ({ section, count: 2 }),
        },
        {
          name: 'save_plan',
          description: 'Save a generation plan',
          parameters: {
            type: 'object',
            properties: {
              tools: { type: 'array', items: { type: 'string' } },
            },
            required: ['tools'],
            additionalProperties: false,
          },
          execute: async (plan) => {
            savedPlans.push(plan);
            return { planId: 'plan-1' };
          },
        },
      ],
    });

    expect(result.status).toBe('completed');
    expect(result.steps).toBe(3);
    expect(savedPlans).toEqual([{ tools: ['example.test.search_records'] }]);
    expect(result.messages.filter((message) => message.role === 'tool')).toHaveLength(2);
  });

  it('returns tool errors to the model so it can recover', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        type: 'tool_call',
        id: 'call-1',
        name: 'missing_tool',
        arguments: {},
      })
      .mockImplementationOnce(async ({ messages }) => {
        const toolResult = messages.find((message) => message.role === 'tool');
        expect(toolResult.isError).toBe(true);
        expect(toolResult.content.code).toBe('UNKNOWN_GENERATION_TOOL');
        return { type: 'final', content: 'recovered' };
      });

    const result = await runToolLoop({ model, tools: [] });
    expect(result.content).toBe('recovered');
  });

  it('validates tool arguments before execution', async () => {
    const execute = vi.fn();
    const registry = new ToolRegistry([{
      name: 'save_plan',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
      execute,
    }]);

    await expect(registry.execute({ name: 'save_plan', arguments: { title: 42 } }))
      .rejects.toMatchObject({ code: 'INVALID_TOOL_ARGUMENTS' });
    expect(execute).not.toHaveBeenCalled();
  });
});
