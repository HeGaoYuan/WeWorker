export {
  assertShellCommand,
  assertShellCommandAllowed,
  buildAgentFilesystemSettings,
  buildUserDirectoryPermissionSettings,
  checkFilesystemPath,
  checkShellCommand,
  checkShellCommandAllowed,
  createUnifiedToolGuard,
  createUserDirectoryToolGuard,
  evaluateToolAccess,
} from './user-directory-access.js'

export type { AccessDecision } from './user-directory-access.js'
