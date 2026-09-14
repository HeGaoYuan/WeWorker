import { describe, expect, it } from 'vitest'
import { buildCliArgFlags } from '../webcli-runner.js'

describe('buildCliArgFlags', () => {
  it('expands simple scalar types as --key=value', () => {
    expect(buildCliArgFlags({ url: 'http://jd.com', limit: 5, enabled: true })).toEqual([
      '--url=http://jd.com',
      '--limit=5',
      '--enabled=true',
    ])
  })

  it('serializes array as JSON literal', () => {
    expect(buildCliArgFlags({ approvers: ['zhangsan', 'lisi'] })).toEqual([
      '--approvers=["zhangsan","lisi"]',
    ])
  })

  it('serializes nested object as JSON literal', () => {
    expect(buildCliArgFlags({ fields: { 标题: 'xxx', 业务类型: '其他' } })).toEqual([
      '--fields={"标题":"xxx","业务类型":"其他"}',
    ])
  })

  it('serializes array of objects as JSON literal', () => {
    expect(buildCliArgFlags({ items: [{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }] })).toEqual([
      '--items=[{"id":1,"name":"foo"},{"id":2,"name":"bar"}]',
    ])
  })

  it('skips undefined and null values', () => {
    expect(buildCliArgFlags({ a: undefined, b: null, c: 'keep' })).toEqual(['--c=keep'])
  })

  it('handles empty object', () => {
    expect(buildCliArgFlags({})).toEqual([])
  })

  it('mixes scalar and complex types', () => {
    const flags = buildCliArgFlags({ keyword: '手机', limit: 5, filters: { status: 'open' } })
    expect(flags).toEqual([
      '--keyword=手机',
      '--limit=5',
      '--filters={"status":"open"}',
    ])
  })
})
