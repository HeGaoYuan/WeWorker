/** Parse scenario prompt templates with ${var} placeholders. */

import { resolvePromptVar } from './prompt-var-display.js'

const PROMPT_VAR_PATTERN = /\$\{[^}]+\}/

export function hasPromptTemplateVars(text) {
  return PROMPT_VAR_PATTERN.test(String(text || ''))
}

export function parsePromptTemplate(prompt) {
  const segments = []
  const re = /\$\{([^}]+)\}/g
  let lastIndex = 0
  let varIndex = 0
  let match
  while ((match = re.exec(prompt)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: prompt.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'var', value: match[1], varIndex: varIndex++ })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < prompt.length) {
    segments.push({ type: 'text', value: prompt.slice(lastIndex) })
  }
  return segments
}

export function buildPromptFromTemplate(prompt, slotValues = {}, varDisplay = {}) {
  return parsePromptTemplate(prompt).map((segment) => {
    if (segment.type !== 'var') return segment.value
    const slotKey = String(segment.varIndex)
    if (Object.prototype.hasOwnProperty.call(slotValues, slotKey)) {
      return slotValues[slotKey]
    }
    return resolvePromptValue(segment.value, varDisplay)
  }).join('')
}

function resolvePromptValue(inner, varDisplay = {}) {
  return resolvePromptVar(inner, varDisplay).resolve
}
