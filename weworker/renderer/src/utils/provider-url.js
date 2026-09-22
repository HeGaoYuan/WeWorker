export function getAnthropicUrlHint(fullUrl) {
  return fullUrl ? '使用填写的完整 URL，不追加任何后缀' : '填写基础 URL，软件自动追加 /v1/messages'
}

export function getOpenAiUrlHint(fullUrl) {
  return fullUrl ? '使用填写的完整 URL，不追加任何后缀' : '填写基础 URL，软件自动追加 /chat/completions'
}
