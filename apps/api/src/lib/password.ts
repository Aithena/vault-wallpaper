/** PBKDF2 password hashing for Workers (Web Crypto). */

const ITERATIONS = 100_000

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let str = ''
  for (const b of arr) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64Decode(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64s = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 10_000) return false
  const salt = b64Decode(parts[2])
  const expected = b64Decode(parts[3])
  const bits = new Uint8Array(await derive(password, salt, iterations))
  if (bits.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < bits.length; i++) diff |= bits[i]! ^ expected[i]!
  return diff === 0
}
