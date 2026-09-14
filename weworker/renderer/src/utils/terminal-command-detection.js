function startsWithChinese(text) {
  return /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text)
}

export function isLikelyCommand(input) {
  const text = String(input || '').trim()
  if (!text) return false
  return !startsWithChinese(text)
}

export function isNaturalLanguageInput(input) {
  const text = String(input || '').trim()
  if (!text) return false
  return startsWithChinese(text)
}
