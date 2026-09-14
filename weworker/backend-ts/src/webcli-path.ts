import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function backendModuleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url))
}

function weworkerRoot(): string {
  return path.resolve(backendModuleDir(), '../..')
}

/** Directory containing the `webcli` shell/cmd wrappers (for PATH). */
export function resolveWebcliDir(): string {
  if (process.env.WEWORKER_PACKAGED) {
    return path.join(process.env.WEWORKER_RESOURCES_PATH || '', 'webcli')
  }
  const bundledDir = path.join(weworkerRoot(), 'build', 'webcli-dist')
  if (fs.existsSync(path.join(bundledDir, 'webcli.cjs'))) {
    return bundledDir
  }
  return path.resolve(backendModuleDir(), '../../../webcli')
}

/** JS entry file for execFile (webcli.cjs bundle or source index.js). */
export function resolveWebcliEntry(): string {
  if (process.env.WEWORKER_PACKAGED) {
    return path.join(process.env.WEWORKER_RESOURCES_PATH || '', 'webcli', 'webcli.cjs')
  }
  const bundledEntry = path.join(weworkerRoot(), 'build', 'webcli-dist', 'webcli.cjs')
  if (fs.existsSync(bundledEntry)) {
    return bundledEntry
  }
  return path.resolve(backendModuleDir(), '../../../webcli/index.js')
}
