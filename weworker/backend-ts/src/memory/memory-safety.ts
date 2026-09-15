import { redactSensitive } from '../http-security.js'
import type { MemoryUpdateCandidate } from './memory-types.js'

const LOCAL_PATH_PATTERN = /(?:[a-z]:\\(?:users|documents and settings)\\|\/(?:users|home)\/)[^\s"']+/iu
const REDACTION_MARKER_PATTERN = /\[REDACTED(?:_API_KEY)?\]/u
const SENSITIVE_KEY_PATTERN = /^(?:api[_-]?key|authorization|token|secret|bot[_-]?token|client[_-]?secret)$/iu
const COMMON_CREDENTIAL_PATTERNS = [
  /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu,
  /\bAKIA[A-Z0-9]{16}\b/gu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
]

export function redactMemoryText(value: string): string {
  let redacted = redactSensitive(String(value || ''))
    .replace(/(?:[a-z]:\\(?:users|documents and settings)\\|\/(?:users|home)\/)[^\s"']+/giu, '[REDACTED_PATH]')
  for (const pattern of COMMON_CREDENTIAL_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_CREDENTIAL]')
  }
  return redacted
}

function serializedCandidate(candidate: MemoryUpdateCandidate): string {
  return JSON.stringify({
    key: candidate.key,
    content: candidate.content,
    facts: candidate.facts ?? {},
  })
}

function containsSensitiveValue(value: unknown, key = ''): boolean {
  if (typeof value === 'string') {
    return (
      (SENSITIVE_KEY_PATTERN.test(key) && value.trim().length > 0)
      || redactMemoryText(value) !== value
      || LOCAL_PATH_PATTERN.test(value)
      || REDACTION_MARKER_PATTERN.test(value)
    )
  }
  if (Array.isArray(value)) return value.some((item) => containsSensitiveValue(item, key))
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([entryKey, entryValue]) => containsSensitiveValue(entryValue, entryKey))
  }
  return false
}

export function assertSafeMemoryCandidate(candidate: MemoryUpdateCandidate): void {
  if (candidate.action === 'ignore') return
  const serialized = serializedCandidate(candidate)
  if (
    SENSITIVE_KEY_PATTERN.test(candidate.key.trim())
    || containsSensitiveValue(candidate.content)
    || containsSensitiveValue(candidate.facts ?? {})
    || redactMemoryText(serialized) !== serialized
    || LOCAL_PATH_PATTERN.test(serialized)
    || REDACTION_MARKER_PATTERN.test(serialized)
  ) {
    throw new Error('memory candidate contains sensitive data')
  }
}
