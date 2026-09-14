/**
 * webcli-result-project：纯投影助手单测（无 IO）。
 */
import { describe, it, expect } from 'vitest'
import {
  stripRaw,
  detectMainArray,
  buildCompactSummary,
  projectResult,
} from '../webcli-result-project.js'

describe('stripRaw', () => {
  it('递归剥离 raw 键', () => {
    const input = { id: 1, raw: { big: 'x'.repeat(1000) }, nested: { keep: 1, raw: 'drop' } }
    const out = stripRaw(input) as any
    expect(out.id).toBe(1)
    expect(out.raw).toBeUndefined()
    expect(out.nested.keep).toBe(1)
    expect(out.nested.raw).toBeUndefined()
  })

  it('剥离数组元素里的 raw', () => {
    const input = { items: [{ id: 1, raw: 1 }, { id: 2, raw: 2 }] }
    const out = stripRaw(input) as any
    expect(out.items).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('includeRaw=true 时保留 raw', () => {
    const input = { id: 1, raw: { k: 'v' } }
    const out = stripRaw(input, true) as any
    expect(out.raw).toEqual({ k: 'v' })
  })
})

describe('detectMainArray', () => {
  it('优先 items', () => {
    expect(detectMainArray({ items: [1, 2], tickets: [3] })).toEqual({ key: 'items', array: [1, 2] })
  })
  it('其次 tickets', () => {
    expect(detectMainArray({ tickets: [{ id: 1 }] })).toEqual({ key: 'tickets', array: [{ id: 1 }] })
  })
  it('再其次 data 数组', () => {
    expect(detectMainArray({ data: [9, 9] })).toEqual({ key: 'data', array: [9, 9] })
  })
  it('无约定键时回退第一个顶层数组', () => {
    expect(detectMainArray({ foo: 'bar', rows: [1] })).toEqual({ key: 'rows', array: [1] })
  })
  it('无数组返回 null', () => {
    expect(detectMainArray({ a: 1 })).toBeNull()
    expect(detectMainArray(null)).toBeNull()
  })
})

describe('buildCompactSummary', () => {
  it('列表形态：渲染 meta + 编号项，剥 raw 并截断长值', () => {
    const obj = {
      ok: true,
      mode: 'req',
      count: 2,
      items: [
        { requestId: '100', requestTitle: 't'.repeat(200), raw: { big: 'x'.repeat(2000) } },
        { requestId: '101', requestTitle: 'short' },
      ],
    }
    const summary = buildCompactSummary(obj)
    expect(summary).toContain('count=2')
    expect(summary).toContain('requestId: 100')
    expect(summary).toContain('requestId: 101')
    expect(summary).not.toMatch(/big/) // raw 已剥
    expect(summary).not.toContain('x'.repeat(200)) // 长值已截断
    expect(summary).toContain('…')
  })

  it('详情形态：渲染自带 sections', () => {
    const obj = {
      mode: 'req',
      sections: [
        { title: '基本信息', columns: ['id', 'title'], rows: [{ id: '1', title: 'T1' }] },
      ],
      raw: { huge: 'y'.repeat(3000) },
    }
    const summary = buildCompactSummary(obj)
    expect(summary).toContain('【基本信息】')
    expect(summary).toContain('id=1')
    expect(summary).toContain('title=T1')
    expect(summary).not.toMatch(/huge/)
  })

  it('超过 cap 时截断并提示', () => {
    const obj = { items: Array.from({ length: 500 }, (_, i) => ({ id: i, t: 'item-' + i })) }
    const summary = buildCompactSummary(obj, 500)
    expect(summary.length).toBeLessThan(700)
    expect(summary).toContain('webcli_result')
  })
})

describe('projectResult', () => {
  const obj = {
    count: 3,
    items: [
      { id: 1, title: 'alpha', raw: { b: 1 } },
      { id: 2, title: 'beta foo', raw: { b: 2 } },
      { id: 3, title: 'gamma foo', raw: { b: 3 } },
    ],
  }

  it('keys 模式：展示结构', () => {
    const out = projectResult(obj, { mode: 'keys' })
    expect(out).toContain('items: array[3]')
    expect(out).toContain('count')
  })

  it('page 模式：分页 + keyword 过滤，剥 raw', () => {
    const out = projectResult(obj, { mode: 'page', keyword: 'foo', page: 1, pageSize: 10 })
    expect(out).toContain('共 2 条')
    expect(out).toContain('beta foo')
    expect(out).toContain('gamma foo')
    expect(out).not.toContain('alpha')
    expect(out).not.toMatch(/\{.*"b":[12].*\}/) // raw 已剥
  })

  it('page 模式：分页边界与下一页提示', () => {
    const out = projectResult(obj, { mode: 'page', page: 1, pageSize: 2 })
    expect(out).toContain('第 1 页 (2/2)')
    expect(out).toContain('下一页 page=2')
  })

  it('pick 模式：抽取指定字段', () => {
    const out = projectResult(obj, { mode: 'pick', fields: 'id,title' })
    expect(out).toContain('id=1')
    expect(out).toContain('title=alpha')
    expect(out).toContain('id=3')
  })

  it('item 模式：默认剥 raw，includeRaw 含 raw', () => {
    const noRaw = projectResult(obj, { mode: 'item', index: 0 })
    expect(noRaw).toContain('"id": 1')
    expect(noRaw).not.toContain('"raw"')
    const withRaw = projectResult(obj, { mode: 'item', index: 0, includeRaw: true })
    expect(withRaw).toContain('"raw"')
  })

  it('item 模式：越界提示', () => {
    const out = projectResult(obj, { mode: 'item', index: 99 })
    expect(out).toContain('超出范围')
  })
})
