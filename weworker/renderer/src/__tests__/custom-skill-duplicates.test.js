import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findDuplicateCustomSkillName,
  findDuplicateCustomSkillNameForSkill,
} from '../utils/custom-skill-duplicates.js'

describe('custom skill duplicate names', () => {
  it('finds a duplicated requested name from SKILL.md frontmatter', () => {
    const skills = [
      { id: 'a', name: 'first', markdown: '---\nname: site.task_helper\n---\n' },
      { id: 'b', name: 'second', markdown: '---\nname: Site.Task_Helper\n---\n' },
    ]

    assert.equal(findDuplicateCustomSkillName(skills), 'Site.Task_Helper')
    assert.equal(findDuplicateCustomSkillNameForSkill(skills, 'a'), 'site.task_helper')
    assert.equal(findDuplicateCustomSkillNameForSkill(skills, 'b'), 'Site.Task_Helper')
  })

  it('does not mark unrelated skills when another skill name is unique', () => {
    const skills = [
      { id: 'a', name: 'site.task_helper', markdown: '---\nname: site.task_helper\n---\n' },
      { id: 'b', name: 'site.other_helper', markdown: '---\nname: site.other_helper\n---\n' },
    ]

    assert.equal(findDuplicateCustomSkillName(skills), '')
    assert.equal(findDuplicateCustomSkillNameForSkill(skills, 'b'), '')
  })

  it('detects a public skill rename that conflicts with another skill folder', () => {
    const skills = [
      { id: 'site.task_helper', name: 'site.task_helper', markdown: '---\nname: site.task_helper\n---\n' },
      { id: 'site.task_helper1', name: 'site.task_helper1', markdown: '---\nname: site.task_helper\n---\n' },
    ]

    assert.equal(findDuplicateCustomSkillNameForSkill(skills, 'site.task_helper1'), 'site.task_helper')
  })

  it('detects a public custom skill rename that conflicts with a builtin skill', () => {
    const skills = [
      { id: 'webcli', name: 'webcli', markdown: '---\nname: webcli\n---\n' },
      { id: 'demo', name: 'demo', markdown: '---\nname: webcli\n---\n' },
    ]

    assert.equal(findDuplicateCustomSkillNameForSkill(skills, 'demo'), 'webcli')
  })
})
