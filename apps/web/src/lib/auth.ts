import { reactive } from 'vue'
import type { SessionUser } from '@vault/shared'
import { api, clearToken, getToken, type MeResponse } from './api'
import { clearBrowseSessionId, getBrowseSessionId } from './browse-session'
import { startPresenceHeartbeat, stopPresenceHeartbeat } from './presence'

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
    stopPresenceHeartbeat()
    return
  }
  try {
    const data = await api<MeResponse>('/api/me')
    authState.user = data.user
    if (data.user) startPresenceHeartbeat()
    else stopPresenceHeartbeat()
  } catch {
    clearToken()
    clearBrowseSessionId()
    authState.user = null
    stopPresenceHeartbeat()
  } finally {
    authState.ready = true
  }
}

export async function logout() {
  const sessionId = getBrowseSessionId()
  if (getToken()) {
    try {
      await api('/api/me/logout', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      /* ignore */
    }
  }
  clearToken()
  clearBrowseSessionId()
  authState.user = null
  stopPresenceHeartbeat()
}
