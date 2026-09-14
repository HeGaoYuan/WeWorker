export function isBrowserExtensionOrigin(origin) {
  return typeof origin === 'string'
    && (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://"))
}

export function isAllowedBridgeOrigin(origin) {
  if (!origin) return true
  return isBrowserExtensionOrigin(origin)
}
