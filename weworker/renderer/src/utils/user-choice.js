export function cleanUserChoiceText(value) {
  return String(value ?? '')
    .replace(/^(?:(?:\u951f[\uFFFD?])|\u9221\?|\u951f\u65a4\u62f7|\uFFFD)+\s*/u, '')
    .trim()
}

export function normalizeUserChoiceOptions(options) {
  return (Array.isArray(options) ? options : []).map((option) => ({
    ...option,
    label: cleanUserChoiceText(option?.label),
    ...(option?.description != null
      ? { description: cleanUserChoiceText(option.description) }
      : {}),
  }))
}

export function normalizeUserChoiceBlock(block) {
  if (!block || block.type !== 'user_choice') return block
  return {
    ...block,
    question: cleanUserChoiceText(block.question),
    options: normalizeUserChoiceOptions(block.options),
    ...(block.answer != null ? { answer: cleanUserChoiceText(block.answer) } : {}),
  }
}
