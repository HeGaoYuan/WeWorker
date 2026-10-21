import test from 'node:test'
import assert from 'node:assert/strict'
import { publicSkillEntries, skillDirectoryName, withInstalledSkillState } from '../utils/skill-management.js'

test('resolves public, official and site custom Skills to actual directory names', () => {
  assert.equal(skillDirectoryName({ id: 'disk', name: 'frontmatter', source: 'public-custom' }), 'disk')
  assert.equal(skillDirectoryName({ id: 'webcli-example', source: 'official-skill' }), 'webcli-example')
  assert.equal(skillDirectoryName({ id: 'random-id', name: 'task', source: 'custom' }), 'webcli-task')
  assert.equal(skillDirectoryName({ directoryName: 'webcli-safe', name: 'safe', source: 'custom' }), 'webcli-safe')
})

test('disk state takes precedence over stale cached UI state; missing Skills do not appear enabled', () => {
  const tool = { id: 'example', enabled: true }
  assert.equal(withInstalledSkillState(tool, [{ name: 'example', enabled: false }]).enabled, false)
  assert.equal(withInstalledSkillState(tool, []).installed, false)
  assert.equal(withInstalledSkillState(tool, []).enabled, false)
  assert.equal(withInstalledSkillState(tool, [{ name: 'example', enabled: false, draft: true }]).draft, true)
  const installed = withInstalledSkillState(tool, [{ name: 'example', createdAt: 123, creationOrderKey: '1:20' }])
  assert.equal(installed.createdAt, 123)
  assert.equal(installed.creationOrderKey, '1:20')
  assert.equal(withInstalledSkillState(installed, []).createdAt, 123)
})

test('keeps shared and imported webcli-prefixed Skills visible without duplicating site cards', () => {
  const entries = ['webcli-browser', 'webcli-imported', 'webcli-example', 'webcli-task', 'blank'].map(name => ({ name }))
  assert.deepEqual(publicSkillEntries(entries, [{ id: 'webcli-example' }, { source: 'custom', name: 'task' }]).map(item => item.name), ['webcli-browser', 'webcli-imported', 'blank'])
})
