/**
 * Display / resolve ${var} placeholders in scenario prompts (from registry.json prompt_var_display).
 */

export type PromptVarStyle = 'code' | 'placeholder'

export interface PromptVarDisplayEntry {
  label?: string
  style?: PromptVarStyle
  /** Value used when filling chat input; defaults to variable name */
  resolve?: string
}

export type PromptVarDisplayMap = Record<string, PromptVarDisplayEntry>

const TECH_ID = /^[A-Za-z0-9][A-Za-z0-9_.\[\]-]*$/

export function isTechnicalPromptVar(inner: string): boolean {
  const s = inner.trim()
  if (!TECH_ID.test(s)) return false
  return /[A-Za-z]/.test(s) && !/[\u4e00-\u9fff]/.test(s)
}

export function mergePromptVarDisplay(
  defaults?: PromptVarDisplayMap,
  adapter?: PromptVarDisplayMap,
): PromptVarDisplayMap {
  return { ...(defaults ?? {}), ...(adapter ?? {}) }
}

export function resolvePromptVar(inner: string, map: PromptVarDisplayMap = {}) {
  const key = inner.trim()
  const cfg = map[key]
  if (cfg) {
    const label = cfg.label ?? key
    const resolve = cfg.resolve ?? (cfg.style === 'placeholder' ? key : label)
    return {
      style: (cfg.style ?? 'code') as PromptVarStyle,
      label,
      resolve,
    }
  }
  if (isTechnicalPromptVar(key)) {
    return { style: 'code' as const, label: key, resolve: key }
  }
  return { style: 'placeholder' as const, label: '…', resolve: key }
}

/** Plain text for scenario previews (code ids kept, Chinese placeholders → …). */
export function formatPromptForDisplay(text: string, map: PromptVarDisplayMap = {}): string {
  return text
    .replace(/\$\{([^}]+)\}/g, (_, inner) => resolvePromptVar(inner, map).label)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text for chat fill — keeps technical ids as literal values. */
export function formatPromptForFill(text: string, map: PromptVarDisplayMap = {}): string {
  return text
    .replace(/\$\{([^}]+)\}/g, (_, inner) => resolvePromptVar(inner, map).resolve)
    .replace(/\s+/g, ' ')
    .trim()
}
