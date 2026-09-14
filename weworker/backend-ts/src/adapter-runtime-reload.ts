import { clearAdapterCache } from './adapter-parser.js'
import { createLogger } from './logger.js'

const log = createLogger('adapter-runtime-reload')
const SAFE_ADAPTER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

type SkillInstaller = (siteKey: string) => Promise<void>

let installSkill: SkillInstaller | null = null
let reloadQueue: Promise<void> = Promise.resolve()

export function configureAdapterRuntimeReload(installer: SkillInstaller): void {
  installSkill = installer
}

/**
 * Refresh adapter discovery immediately and serialize Skill installation so a
 * chat started right after scaffold generation cannot race the filesystem copy.
 */
export function scheduleAdapterRuntimeReload(siteKey: string): Promise<void> {
  const normalizedSiteKey = siteKey.trim()
  if (!SAFE_ADAPTER_ID_RE.test(normalizedSiteKey)) {
    return Promise.reject(new Error(`Invalid adapter id: ${siteKey}`))
  }

  // Make the newly written manifest visible to synchronous readers right away.
  clearAdapterCache()

  const previous = reloadQueue
  const reloadTask = previous.then(async () => {
    if (!installSkill) {
      throw new Error('Adapter runtime reload installer is not configured')
    }
    log.info(`hot-reloading generated adapter: ${normalizedSiteKey}`)
    await installSkill(normalizedSiteKey)
    // The adapter may have been read while Skill installation was in flight.
    clearAdapterCache()
    log.info(`generated adapter ready: ${normalizedSiteKey}`)
  })
  // A failed hot reload should be reported to its caller, but must not poison
  // every later chat turn. The shared queue therefore settles after logging.
  reloadQueue = reloadTask.catch((e) => {
    log.error(`generated adapter hot reload failed: ${normalizedSiteKey}`, e)
  })

  return reloadTask
}

/** Wait until all scaffold-triggered adapter reloads observed so far finish. */
export async function waitForAdapterRuntimeReload(): Promise<void> {
  await reloadQueue
}

/** Test-only state reset. */
export function resetAdapterRuntimeReloadForTest(): void {
  installSkill = null
  reloadQueue = Promise.resolve()
}
