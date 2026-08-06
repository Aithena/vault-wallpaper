import { reactive } from 'vue'
import type { SessionUser } from '@vault/shared'
import { api, clearToken, getToken, type MeResponse } from './api'

export const authState = reactive<{
  ready: boolean
  user: SessionUser | null
}>({
  ready: false,
  user: null,
})

export async function refreshMe() {
  if (!getToken()) {
    authState.user = null
    authState.ready = true
    return
  }
  try {
    const data = await api<MeResponse>('/api/me')
    authState.user = data.user
  } catch {
    clearToken()
    authState.user = null
  } finally {
    authState.ready = true
  }
}

export function logout() {
  clearToken()
  authState.user = null
}
