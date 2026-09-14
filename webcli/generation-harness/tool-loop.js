import { GenerationCancelledError, GenerationHarnessError } from './errors.js';
import { ToolRegistry } from './tool-registry.js';

function normalizeModelResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new GenerationHarnessError('model returned an empty tool-loop response', 'INVALID_MODEL_RESPONSE');
  }
  if (response.type === 'final') {
    return {
      type: 'final',
      content: String(response.content || ''),
      data: response.data,
    };
  }
  const calls = response.type === 'tool_call'
    ? [response]
    : Array.isArray(response.calls) ? response.calls : [];
  if ((response.type === 'tool_call' || response.type === 'tool_calls') && calls.length > 0) {
    return {
      type: 'tool_calls',
      calls: calls.map((call, index) => ({
        id: String(call.id || `call-${index + 1}`),
        name: String(call.name || call.tool || ''),
        arguments: call.arguments ?? {},
      })),
    };
  }
  throw new GenerationHarnessError(
    `unsupported model response type: ${String(response.type || 'unknown')}`,
    'INVALID_MODEL_RESPONSE',
    { response },
  );
}

function assertActive(signal) {
  if (signal?.aborted) throw new GenerationCancelledError();
}

export async function runToolLoop({
  model,
  tools = [],
  messages = [],
  systemPrompt = '',
  maxSteps = 8,
  signal,
  context = {},
  onEvent = null,
}) {
  if (typeof model !== 'function') throw new Error('runToolLoop requires a model function');
  const registry = tools instanceof ToolRegistry ? tools : new ToolRegistry(tools);
  const conversation = structuredClone(messages);
  const toolDefinitions = registry.listForModel();

  for (let step = 1; step <= maxSteps; step += 1) {
    assertActive(signal);
    onEvent?.({ type: 'model_started', step });
    const rawResponse = await model({
      systemPrompt,
      messages: structuredClone(conversation),
      tools: toolDefinitions,
      step,
      signal,
    });
    assertActive(signal);
    const response = normalizeModelResponse(rawResponse);
    onEvent?.({ type: 'model_completed', step, response });

    if (response.type === 'final') {
      conversation.push({ role: 'assistant', content: response.content });
      return {
        status: 'completed',
        steps: step,
        content: response.content,
        data: response.data,
        messages: conversation,
      };
    }

    conversation.push({ role: 'assistant', toolCalls: response.calls });
    for (const call of response.calls) {
      assertActive(signal);
      onEvent?.({ type: 'tool_started', step, call });
      let output;
      let isError = false;
      try {
        output = await registry.execute(call, { ...context, signal, step, call });
      } catch (error) {
        isError = true;
        output = {
          error: error?.message || String(error),
          code: error?.code || 'TOOL_EXECUTION_FAILED',
          details: error?.details,
        };
      }
      const toolResult = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: output,
        isError,
      };
      conversation.push(toolResult);
      onEvent?.({ type: 'tool_completed', step, call, output, isError });
    }
  }

  throw new GenerationHarnessError(
    `tool loop exceeded maxSteps=${maxSteps}`,
    'TOOL_LOOP_MAX_STEPS',
    { maxSteps },
  );
}
