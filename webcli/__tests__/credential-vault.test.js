import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CredentialVault, createWindowsDpapi, maskUsername } from '../credential-vault.js'

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'weworker-vault-test-'))
/** Stand-in for DPAPI: reversible but never the plain text. */
const fakeBackend = () => ({
  supported: true, name: 'fixture',
  protect: vi.fn(async (plain) => Buffer.from(plain, 'utf8').toString('base64').split('').reverse().join('')),
  unprotect: vi.fn(async (encoded) => Buffer.from(encoded.split('').reverse().join(''), 'base64').toString('utf8')),
})

describe('credential vault', () => {
  it('stores only ciphertext, keeps secret-free preferences, and decrypts for the Bridge', async () => {
    const home = temp()
    const vault = new CredentialVault({ browserHome: home, backend: fakeBackend(), now: () => Date.parse('2026-10-17T00:00:00Z') })
    expect(vault.site('fixture.example.com')).toMatchObject({ enabled: false, configured: false })
    const saved = await vault.save('fixture.example.com', { username: 'fixture.user@example.com', password: 'fixture-password-123' })
    expect(saved).toMatchObject({ enabled: true, configured: true, username: 'fi******@example.com', savedAt: '2026-10-17T00:00:00.000Z' })
    const onDisk = fs.readdirSync(home, { recursive: true }).map((name) => path.join(home, name)).filter((file) => fs.statSync(file).isFile())
    for (const file of onDisk) {
      const text = fs.readFileSync(file, 'utf8')
      expect(text).not.toContain('fixture-password-123')
      expect(text).not.toContain('fixture.user@example.com')
    }
    await expect(vault.load('fixture.example.com')).resolves.toEqual({ v: 1, username: 'fixture.user@example.com', password: 'fixture-password-123' })
    vault.updateSite('fixture.example.com', { enabled: false })
    expect(vault.site('fixture.example.com')).toMatchObject({ enabled: false, configured: true })
    expect(vault.remove('fixture.example.com')).toBe(true)
    expect(vault.site('fixture.example.com')).toMatchObject({ enabled: false, configured: false, username: '' })
    await expect(vault.load('fixture.example.com')).resolves.toBeNull()
  })

  it('validates input and refuses unsupported systems and unsafe site names', async () => {
    const vault = new CredentialVault({ browserHome: temp(), backend: fakeBackend() })
    await expect(vault.save('fixture.example.com', { username: ' ', password: 'x' })).rejects.toThrow(/账号/)
    await expect(vault.save('fixture.example.com', { username: 'a', password: '' })).rejects.toThrow(/密码/)
    await expect(vault.save('../escape', { username: 'a', password: 'b' })).rejects.toThrow(/Invalid site/)
    const unsupported = new CredentialVault({ browserHome: temp(), backend: { supported: false, name: 'unsupported' } })
    expect(unsupported.supported).toBe(false)
    await expect(unsupported.save('fixture.example.com', { username: 'a', password: 'b' })).rejects.toThrow(/暂不支持/)
  })

  it('passes secrets to DPAPI over stdin only', async () => {
    const run = vi.fn(async (script, input) => (script.includes('Unprotect') ? Buffer.from('{"v":1}').toString('base64') : 'cipher'))
    const dpapi = createWindowsDpapi(run)
    await dpapi.protect('{"password":"fixture"}')
    expect(run.mock.calls[0][0]).not.toContain('fixture')
    expect(run.mock.calls[0][1]).toContain('fixture')
    await expect(dpapi.unprotect('cipher')).resolves.toBe('{"v":1}')
  })

  it('masks usernames', () => {
    expect(maskUsername('fixture.user@example.com')).toBe('fi******@example.com')
    expect(maskUsername('13800000000')).toBe('13******')
    expect(maskUsername('ab')).toBe('a**')
  })
})
