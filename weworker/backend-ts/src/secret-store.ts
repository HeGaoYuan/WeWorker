import { randomBytes } from 'node:crypto'
import { Entry } from '@napi-rs/keyring'
import smCrypto from 'sm-crypto'

const { sm4 } = smCrypto

const KEYRING_SERVICE = 'WeWorker'
const KEYRING_ACCOUNT = 'sm4-master-key-v1'

let masterKeyHex: string | null = null

function normalizeMasterKey(value: string | null | undefined): string | null {
  const next = String(value ?? '').trim().toLowerCase()
  return /^[0-9a-f]{32}$/.test(next) ? next : null
}

async function loadMasterKeyFromKeyring(): Promise<string | null> {
  const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT)
  return normalizeMasterKey(await entry.getPassword())
}

async function saveMasterKeyToKeyring(keyHex: string): Promise<void> {
  const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT)
  await entry.setPassword(keyHex)
}

async function getOrCreateMasterKey(): Promise<string> {
  const existing = await loadMasterKeyFromKeyring()
  if (existing) return existing
  const created = randomBytes(16).toString('hex')
  await saveMasterKeyToKeyring(created)
  return created
}

export function isSecretStoreReady(): boolean {
  return !!masterKeyHex
}

export async function initSecretStore(): Promise<void> {
  const testKey = normalizeMasterKey(process.env.WEWORKER_TEST_MASTER_KEY)
  if (testKey) {
    masterKeyHex = testKey
    return
  }
  masterKeyHex = await getOrCreateMasterKey()
}

export function setMasterKeyForTests(keyHex: string | null): void {
  masterKeyHex = normalizeMasterKey(keyHex)
}

export function encryptSecret(plaintext: string): string {
  if (!masterKeyHex) throw new Error('Secret store is not initialized')
  const value = String(plaintext ?? '')
  if (!value) return ''
  return sm4.encrypt(value, masterKeyHex)
}

export function decryptSecret(ciphertext: string): string {
  if (!masterKeyHex) throw new Error('Secret store is not initialized')
  const value = String(ciphertext ?? '').trim()
  if (!value) return ''
  return sm4.decrypt(value, masterKeyHex)
}

export function encryptSecrets(secrets: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue
    encrypted[key] = encryptSecret(value)
  }
  return encrypted
}

export function decryptSecrets(encrypted: Record<string, string>): Record<string, string> {
  const secrets: Record<string, string> = {}
  for (const [key, value] of Object.entries(encrypted)) {
    if (!value) continue
    try {
      secrets[key] = decryptSecret(value)
    } catch {
      secrets[key] = ''
    }
  }
  return secrets
}
