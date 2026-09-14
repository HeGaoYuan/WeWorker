import { callConfiguredLanguageModel } from '../ai-analyzer.js';
import { GenerationHarnessError } from './errors.js';

const MESSAGE_TEXT_LIMIT = 16_000;

function truncateText(value, limit = MESSAGE_TEXT_LIMIT) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}...[truncated]` : text;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(candidate.slice(objectStart, objectEnd + 1));
      } catch {}
    }
  }
  throw new GenerationHarnessError(
    'model did not return a valid JSON action',
    'INVALID_JSON_ACTION',
    { preview: truncateText(trimmed, 800) },
  );
}

function serializeMessages(messages) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        toolCallId: message.toolCallId,
        name: message.name,
        isError: Boolean(message.isError),
        content: truncateText(message.content),
      };
    }
    if (message.toolCalls) {
      return { role: message.role, toolCalls: message.toolCalls };
    }
    return { role: message.role, content: truncateText(message.content) };
  });
}

function buildJsonActionPrompt({ systemPrompt, messages, tools, step }) {
  return `${systemPrompt}

你正在运行一个受限的 Adapter Generation Tool Loop。

## 可用工具

${JSON.stringify(tools, null, 2)}

## 当前对话

${JSON.stringify(serializeMessages(messages), null, 2)}

## 当前步骤

${step}

## 输出协议

你每次只能输出一个 JSON 对象，不要输出 Markdown 或解释文字。

调用工具：
{"type":"tool_call","name":"工具名","arguments":{}}

完成任务：
{"type":"final","content":"简短结果","data":{}}

必须使用上方定义过的工具名，arguments 必须符合工具参数 Schema。`;
}

export function createJsonActionModel({ callModel = callConfiguredLanguageModel, taskLabelPrefix = 'adapter generation loop' } = {}) {
  return async ({ systemPrompt, messages, tools, step, signal }) => {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const response = await callModel({
      prompt: buildJsonActionPrompt({ systemPrompt, messages, tools, step }),
      maxTokens: 2400,
      taskLabel: `${taskLabelPrefix} step ${step}`,
    });
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return extractJson(typeof response === 'string' ? response : response?.text);
  };
}

export function parseJsonActionResponse(text) {
  return extractJson(text);
}
