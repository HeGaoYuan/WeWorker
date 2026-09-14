/**
 * Display / resolve ${var} in scenario prompts — config from registry.json `prompt_var_display`.
 */

const TECH_ID = /^[A-Za-z0-9][A-Za-z0-9_.\[\]-]*$/

export function isTechnicalPromptVar(inner) {
  const s = inner.trim()
  if (!TECH_ID.test(s)) return false
  return /[A-Za-z]/.test(s) && !/[\u4e00-\u9fff]/.test(s)
}

export function resolvePromptVar(inner, map = {}) {
  const key = inner.trim()
  const cfg = map[key]
  if (cfg) {
    const label = cfg.label ?? key
    const resolve = cfg.resolve ?? (cfg.style === 'placeholder' ? key : label)
    return {
      style: cfg.style ?? 'code',
      label,
      resolve,
    }
  }
  if (isTechnicalPromptVar(key)) {
    return { style: 'code', label: key, resolve: key }
  }
  return { style: 'placeholder', label: key, resolve: key }
}

export function formatPromptForFill(text, map = {}) {
  return (text || '')
    .replace(/\$\{([^}]+)\}/g, (_, inner) => resolvePromptVar(inner, map).resolve)
    .replace(/\s+/g, ' ')
    .trim()
}
