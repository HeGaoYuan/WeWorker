/** 默认工具调用超时（毫秒） */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 120_000;

/** QQ 邮箱工具调用超时：批量下载等操作较慢 */
export const QQ_MAIL_TOOL_CALL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * 按工具名解析 call_tool 超时（毫秒）
 * @param {string} toolName
 */
export function resolveToolCallTimeout(toolName) {
  if (typeof toolName === "string" && toolName.startsWith("mail.qq.com.")) {
    return QQ_MAIL_TOOL_CALL_TIMEOUT_MS;
  }
  return DEFAULT_TOOL_CALL_TIMEOUT_MS;
}
