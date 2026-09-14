export const CODE_EDITOR_FONT_SIZE = 13
export const CODE_EDITOR_LINE_HEIGHT = 1.55
export const CODE_EDITOR_LINE_HEIGHT_PX = CODE_EDITOR_FONT_SIZE * CODE_EDITOR_LINE_HEIGHT
export const CODE_EDITOR_VERTICAL_PADDING_PX = 18

export function countEditorLines(value) {
  return Math.max(1, String(value || '').split('\n').length)
}

export function codeEditorFitHeight(lineCount, minHeight = 96) {
  return Math.max(minHeight, Math.ceil(lineCount * CODE_EDITOR_LINE_HEIGHT_PX + CODE_EDITOR_VERTICAL_PADDING_PX))
}

export function codeEditorLineNumberRowStyle() {
  return {
    display: 'block',
    height: CODE_EDITOR_LINE_HEIGHT_PX,
    lineHeight: `${CODE_EDITOR_LINE_HEIGHT_PX}px`,
  }
}
