import type { SessionUser } from '@vault/shared'

const TOKEN_KEY = 'vault_token'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''

/** Resolve API or asset paths against VITE_API_BASE (keeps http/blob/data as-is). */
export function apiUrl(path: string): string {
  if (!path) return path
  if (/^(https?:|blob:|data:)/i.test(path)) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(apiUrl(path), { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || res.statusText)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  return data as T
}

export type MeResponse = { user: SessionUser | null }
