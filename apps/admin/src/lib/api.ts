import type { AdminPublic } from '@vault/shared'

const TOKEN_KEY = 'vault_admin_token'
const PROFILE_KEY = 'vault_admin_profile'
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(PROFILE_KEY)
}

export function cacheAdminProfile(admin: AdminPublic) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(admin))
}

export function getCachedAdminProfile(): AdminPublic | null {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminPublic
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

export async function adminApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(apiUrl(path), { ...options, headers })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
  } & T
  if (!res.ok) {
    throw new ApiError(data.error || res.statusText || 'request_failed', res.status)
  }
  return data
}

export async function adminUpload<T>(
  path: string,
  file: File,
  fieldName = 'file',
): Promise<T> {
  const form = new FormData()
  form.append(fieldName, file)
  return adminApi<T>(path, { method: 'POST', body: form })
}

/** Download a non-JSON admin response (e.g. CSV export). */
export async function adminDownload(path: string, filename: string): Promise<void> {
  const headers = new Headers()
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(apiUrl(path), { headers })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(data.error || res.statusText || 'request_failed', res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

