import { describe, expect, it, vi } from 'vitest'
import {
  registerBackendProfileQueryRoute,
  tryBackendProfileQueryRoute,
} from '../profile-query-route.js'

describe('backend profile query route', () => {
  it('falls through until a profile registers a route', async () => {
    const context = { message: 'hello' }
    expect(await tryBackendProfileQueryRoute(context)).toBe(false)

    const route = vi.fn(async () => true)
    registerBackendProfileQueryRoute(route)
    expect(await tryBackendProfileQueryRoute(context)).toBe(true)
    expect(route).toHaveBeenCalledWith(context)
  })
})
