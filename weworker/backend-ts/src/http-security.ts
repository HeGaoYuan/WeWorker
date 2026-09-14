import crypto from 'node:crypto'

export const LOCAL_HTTP_PORT = 8765

export function isAllowedHost(hostHeader: string | undefined, port = LOCAL_HTTP_PORT): boolean {
  const host = String(hostHeader || '').toLowerCase()
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

export function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true
  if (originHeader === 'null' || originHeader === 'file://') return true
  return originHeader === 'http://localhost:5173' || originHeader === 'http://127.0.0.1:5173'
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function isAuthorizedHttpRequest(providedToken: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) return true
  if (!providedToken) return false
  return timingSafeEqualString(providedToken, expectedToken)
}

export function redactSensitive(text: string): string {
  return text
    .replace(/(x-api-key\s*[:=]\s*)([^\s,'"}]+)/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,'"}]+)/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*)([^\s,'"}]+)/gi, '$1[REDACTED]')
    .replace(/((?:token|secret|bot_token|clientSecret)\s*[:=]\s*)([^\s,'"}]+)/gi, '$1[REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, '[REDACTED_API_KEY]')
}
