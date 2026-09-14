export const ASSISTANT_STATUS_PREFIX = '当前状态：'

export function extractAssistantStatusLine(text: string): string | null {
  const match = String(text ?? '').match(/(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?当前状态(?:\*\*)?\s*[：:]\s*(.+?)\s*(?=\n|$)/)
  if (!match?.[1]) return null
  return `${ASSISTANT_STATUS_PREFIX}${match[1].trim()}`
}

export function normalizeAssistantStatusLine(text: string): string | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  const extracted = extractAssistantStatusLine(raw)
  if (extracted) return extracted

  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/^\*\*|\*\*$/g, ''))
    .find(Boolean)

  if (!firstLine) return null
  const normalized = firstLine.replace(/^状态\s*[：:]\s*/u, '').trim()
  if (!normalized) return null
  return `${ASSISTANT_STATUS_PREFIX}${normalized}`
}

export function appendAssistantStatusLine(text: string, statusLine: string): string {
  const body = String(text ?? '').trim()
  const normalized = normalizeAssistantStatusLine(statusLine)
  if (!normalized) return body
  if (!body) return normalized
  return `${body}\n\n${normalized}`
}

export async function ensureAssistantStatusLine(opts: {
  text: string
  generateStatusLine: () => Promise<string | null>
  fallbackStatusLine?: string | null
}): Promise<string> {
  if (extractAssistantStatusLine(opts.text)) return String(opts.text ?? '').trim()

  const generatedText = await opts.generateStatusLine()
  const generated = generatedText ? normalizeAssistantStatusLine(generatedText) : null
  if (generated) return appendAssistantStatusLine(opts.text, generated)

  const fallback = normalizeAssistantStatusLine(opts.fallbackStatusLine ?? '')
  if (fallback) return appendAssistantStatusLine(opts.text, fallback)

  return String(opts.text ?? '').trim()
}

export async function finalizeAssistantTextWithStatus(opts: {
  text: string
  hasAssistantContent: boolean
  generateStatusLine: () => Promise<string | null>
  fallbackStatusLine?: string | null
}): Promise<string> {
  const text = String(opts.text ?? '')
  if (text.trim()) {
    return ensureAssistantStatusLine({
      text,
      generateStatusLine: opts.generateStatusLine,
      fallbackStatusLine: opts.fallbackStatusLine,
    })
  }
  if (!opts.hasAssistantContent) return ''

  const generatedText = await opts.generateStatusLine()
  const generated = generatedText ? normalizeAssistantStatusLine(generatedText) : null
  if (generated) return generated

  return normalizeAssistantStatusLine(opts.fallbackStatusLine ?? '') ?? ''
}
