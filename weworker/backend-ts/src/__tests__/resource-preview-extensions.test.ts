import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESOURCE_PREVIEW_EXTENSIONS,
  getEffectivePreviewExtensions,
  getPreviewExtensionSet,
  isPreviewableExtension,
  normalizePreviewExtension,
  normalizePreviewExtensions,
} from '../resource-preview-extensions.js'

describe('resource preview extensions', () => {
  it('normalizes suffix input to lowercase with leading dot', () => {
    expect(normalizePreviewExtension('RS')).toBe('.rs')
    expect(normalizePreviewExtension('.Java')).toBe('.java')
    expect(normalizePreviewExtension('')).toBeNull()
    expect(normalizePreviewExtension('bad ext')).toBeNull()
  })

  it('deduplicates and sorts normalized extensions', () => {
    expect(normalizePreviewExtensions(['.rs', 'rs', '.java', '.RS'])).toEqual(['.rs', '.java'])
  })

  it('uses defaults when settings value is null', () => {
    expect(getEffectivePreviewExtensions(null)).toEqual([...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS])
    expect(getEffectivePreviewExtensions(undefined)).toEqual([...DEFAULT_RESOURCE_PREVIEW_EXTENSIONS])
  })

  it('replaces defaults entirely when settings value is set', () => {
    expect(getEffectivePreviewExtensions(['.foo'])).toEqual(['.foo'])
    expect(getPreviewExtensionSet(['.foo']).has('.md')).toBe(false)
  })

  it('includes common programming extensions in defaults', () => {
    const defaults = getPreviewExtensionSet(null)
    expect(defaults.has('.rs')).toBe(true)
    expect(defaults.has('.java')).toBe(true)
    expect(defaults.has('.go')).toBe(true)
    expect(defaults.has('.vue')).toBe(true)
    expect(isPreviewableExtension('.cpp', null)).toBe(true)
  })
})
