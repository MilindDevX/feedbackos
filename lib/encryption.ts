import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hexKey = process.env.ENCRYPTION_KEY
  if (!hexKey || hexKey.length < 64) {
    // ── AUDIT FIX: Fail hard in production — zeroed key is insecure ──
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is not set or invalid. Set a 64-char hex key via: openssl rand -hex 32')
    }
    console.warn('[encryption] ⚠️  Using zeroed ENCRYPTION_KEY — NOT safe for production')
    return Buffer.alloc(32, 0)
  }
  return Buffer.from(hexKey.slice(0, 64), 'hex')
}

/**
 * AES-256-GCM encryption
 * Returns: "iv:authTag:ciphertext" (all hex)
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * AES-256-GCM decryption
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
