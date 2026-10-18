import { describe, expect, it } from 'vitest'
import { autofillLogin, locateScript } from '../site-autologin.js'

/**
 * Fake CDP page: `steps` are the field states the locate script reports, one per
 * call (the last repeats). Records typed text and clicks.
 */
function fakePage(steps) {
  const typed = []
  const sent = []
  let locates = 0
  let focused = null
  return {
    typed, sent,
    async send(method, params = {}) {
      sent.push(method)
      if (method === 'Input.insertText') { typed.push([focused, params.text]); return {} }
      if (method !== 'Runtime.evaluate') return {}
      const expression = params.expression
      if (expression.includes('const spec =')) {
        const state = steps[Math.min(locates, steps.length - 1)]
        locates += 1
        return { result: { value: state } }
      }
      const role = expression.match(/data-ww-autologin="(username|password|submit)"/)?.[1]
      if (expression.includes('el.focus()')) { focused = role; return { result: { value: true } } }
      if (expression.includes('getBoundingClientRect')) return { result: { value: { x: 10, y: 20 } } }
      return { result: { value: true } }
    },
  }
}

const credential = { username: 'fixture-user', password: 'fixture-password' }

describe('auto-login form filling', () => {
  it('fills a one-page form with trusted input and clicks submit', async () => {
    const page = fakePage([{ username: true, password: true, submit: true }])
    await expect(autofillLogin(page, credential, {}, { stepDelayMs: 0, switchDelayMs: 0 })).resolves.toEqual({ ok: true })
    expect(page.typed).toEqual([['username', 'fixture-user'], ['password', 'fixture-password']])
    expect(page.sent).toContain('Emulation.setFocusEmulationEnabled')
    expect(page.sent.filter((method) => method === 'Input.dispatchMouseEvent')).toHaveLength(3)
  })

  it('handles two-step forms and presses Enter without a submit button', async () => {
    const page = fakePage([{ username: true, password: false, submit: false }, { username: false, password: true, submit: false }])
    await expect(autofillLogin(page, credential, {}, { stepDelayMs: 0 })).resolves.toEqual({ ok: true })
    expect(page.typed).toEqual([['username', 'fixture-user'], ['password', 'fixture-password']])
    expect(page.sent.filter((method) => method === 'Input.dispatchKeyEvent')).toHaveLength(4)
  })

  it('switches to the password tab first when the Adapter declares it', async () => {
    const page = fakePage([{ username: false, password: false, submit: false }, { username: true, password: true, submit: true }])
    await expect(autofillLogin(page, credential, { switch: '#tab-password' }, { switchDelayMs: 0 })).resolves.toEqual({ ok: true })
    expect(page.sent.filter((method) => method === 'Input.dispatchMouseEvent')).toHaveLength(6)
  })

  it('gives up on QR-code or SMS-only pages', async () => {
    const page = fakePage([{ username: false, password: false, submit: false }])
    await expect(autofillLogin(page, credential, {}, { stepDelayMs: 0 })).resolves.toEqual({ ok: false, reason: 'no_password_field' })
    expect(page.typed).toEqual([])
  })

  it('never puts the credential into page scripts', () => {
    const script = locateScript({ username: '#user', password: '#pass', submit: '#go' })
    expect(script).toContain('"#user"')
    expect(script).not.toContain('fixture-password')
  })
})
