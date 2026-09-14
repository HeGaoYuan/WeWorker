import { describe, expect, it } from 'vitest'
import {
  buildToolExecutionMap,
  isCatalogApiBackgroundCommand,
  mergeManifestToolExecution,
  withCatalogDirectExecution,
} from '../direct-execution-metadata.js'

const apiCommand = {
  status: 'registered',
  publicName: 'matrix.example.com.list_subsystems',
  strategy: 'cookie',
  browser: true,
  navigateBefore: false,
}

describe('direct execution metadata', () => {
  it('classifies registered cookie API commands that do not require navigation', () => {
    expect(isCatalogApiBackgroundCommand(apiCommand)).toBe(true)
    expect(withCatalogDirectExecution(apiCommand)).toMatchObject({
      execution: { type: 'api', runtime: 'background' },
      directCapable: true,
      executionMode: 'direct',
    })
  })

  it('does not classify blocked, page, or pre-navigation commands as background API tools', () => {
    expect(isCatalogApiBackgroundCommand({ ...apiCommand, status: 'blocked' })).toBe(false)
    expect(isCatalogApiBackgroundCommand({ ...apiCommand, executionMode: 'page' })).toBe(false)
    expect(isCatalogApiBackgroundCommand({ ...apiCommand, navigateBefore: true })).toBe(false)
  })

  it('lets explicit audited API metadata override a legacy navigation hint', () => {
    expect(withCatalogDirectExecution({
      ...apiCommand,
      navigateBefore: 'https://matrix.example.com/legacy-page',
      execution: { type: 'api', runtime: 'background' },
    })).toMatchObject({
      execution: { type: 'api', runtime: 'background' },
      directCapable: true,
      executionMode: 'direct',
    })
  })

  it('merges generated metadata without replacing explicit manifest decisions', () => {
    const manifest = {
      id: 'matrix.example.com',
      tool_execution: {
        'matrix.example.com.list_subsystems': { type: 'mixed', runtime: 'page' },
      },
    }
    const merged = mergeManifestToolExecution(manifest, [
      apiCommand,
      { ...apiCommand, publicName: 'matrix.example.com.list_environments' },
    ])

    expect(merged.tool_execution).toEqual({
      'matrix.example.com.list_subsystems': { type: 'mixed', runtime: 'page' },
      'matrix.example.com.list_environments': { type: 'api', runtime: 'background' },
    })
    expect(buildToolExecutionMap([apiCommand])).toEqual({
      'matrix.example.com.list_subsystems': { type: 'api', runtime: 'background' },
    })
  })
})
