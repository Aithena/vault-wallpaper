/** Minimal HMAC session token (JWT-like) for Workers experiment. */

function b64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export type SessionPayload = {
  sub: string
  email: string
  exp: number
  /** Absent or `user` = C 端；`admin` = 管理后台 */
  role?: 'user' | 'admin'
  username?: string
}

export async function signSession(
  secret: string,
  payload: Omit<SessionPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const body: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const mid = b64url(JSON.stringify(body))
  const data = `${header}.${mid}`
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  )
  return `${data}.${b64url(sig)}`
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, mid, sig] = parts
  const data = `${header}.${mid}`
  const key = await importKey(secret)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(sig),
    new TextEncoder().encode(data),
  )
  if (!ok) return null
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(mid)),
    ) as SessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function readBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim() || null
}
