import { expect, it } from 'vitest'
import { officialSkillBuildTime, SKILL_BUILD_TIME } from '../skill-build-time.js'

it('uses one fixed build time for bundled Skills and official Adapter Skills only', () => {
  const builtAt = Date.UTC(2026, 0, 2)
  const isBuiltin = (id: string) => id === 'example.com'
  for (const name of ['webcli', 'webcli-browser', 'webcli-api-exploration', 'complex-task-planner', 'webcli-example.com']) {
    expect(officialSkillBuildTime(name, isBuiltin, builtAt)).toBe(builtAt)
  }
  for (const name of ['uploaded-example', 'webcli-user-adapter', 'example.com']) {
    expect(officialSkillBuildTime(name, isBuiltin, builtAt)).toBeUndefined()
  }
  expect(SKILL_BUILD_TIME).toBeGreaterThan(0)
})
