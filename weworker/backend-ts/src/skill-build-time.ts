import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

declare const __BUILD_TIMESTAMP__: number

// Packaged builds embed the compilation time. Source development has no
// compilation step, so use this source revision's modification time.
export const SKILL_BUILD_TIME = typeof __BUILD_TIMESTAMP__ !== 'undefined'
  ? __BUILD_TIMESTAMP__
  : fs.statSync(fileURLToPath(import.meta.url)).mtimeMs

const sharedSkills = new Set(['webcli', 'webcli-browser', 'webcli-api-exploration', 'complex-task-planner', 'personal-codewords'])

export function officialSkillBuildTime(name: string, isBuiltinAdapter: (id: string) => boolean, builtAt = SKILL_BUILD_TIME): number | undefined {
  return sharedSkills.has(name) || (name.startsWith('webcli-') && isBuiltinAdapter(name.slice(7)))
    ? builtAt
    : undefined
}
