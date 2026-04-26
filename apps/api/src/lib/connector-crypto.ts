import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM at-rest encryption for connector OAuth tokens. The ciphertext is prefixed with
// a version tag so we can rotate the key/algorithm without ambiguity: a future v2 just adds a
// new branch to `decrypt` and migrates lazily on next refresh.
//
// Format: `v1:<iv_b64>:<ciphertext_b64>:<tag_b64>`
//   - 12-byte IV (GCM standard, randomly generated per call)
//   - GCM auth tag is appended separately so we can verify on decrypt
//
// Threat model: someone with read-only DB access (a SQL injection, a leaked backup, a
// stolen replica). They get ciphertext but can't decrypt without CONNECTORS_ENCRYPTION_KEY,
// which lives in process env / secrets manager.

const VERSION = 'v1'
const IV_BYTES = 12

function loadKey(): Buffer {
  const raw = process.env.CONNECTORS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('CONNECTORS_ENCRYPTION_KEY is not set')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('CONNECTORS_ENCRYPTION_KEY must decode to 32 bytes')
  }
  return key
}

let cachedKey: Buffer | null = null
function key(): Buffer {
  if (!cachedKey) cachedKey = loadKey()
  return cachedKey
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`
}

export function decryptToken(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('connector_crypto_unknown_format')
  }
  const iv = Buffer.from(parts[1]!, 'base64')
  const ct = Buffer.from(parts[2]!, 'base64')
  const tag = Buffer.from(parts[3]!, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function connectorsEnabled(): boolean {
  return Boolean(process.env.CONNECTORS_ENCRYPTION_KEY)
}
