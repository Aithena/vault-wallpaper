import { api, getToken } from './api'
import { getBrowseSessionId } from './browse-session'

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let lastPath = ''

export async function sendPresence(path?: string) {
  if (!getToken()) return
  try {
    await api('/api/me/presence', {
      method: 'POST',
      body: JSON.stringify({ path: path || lastPath || undefined }),
    })
  } catch {
    /* ignore */
  }
}

export async function trackPage(path: string, label?: string) {
  lastPath = path
  const sessionId = getBrowseSessionId()
  if (!getToken() || !sessionId) return
  try {
    const data = await api<{ ended?: boolean }>('/api/me/track', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        type: 'page',
        path,
        label,
      }),
    })
    if (data.ended) {
      // idle closed — stop pretending session is alive; next login starts new
    }
  } catch {
    /* ignore */
  }
}

export function startPresenceHeartbeat() {
  stopPresenceHeartbeat()
  if (!getToken()) return
  void sendPresence(typeof location !== 'undefined' ? location.pathname : undefined)
  heartbeatTimer = setInterval(() => {
    void sendPresence()
  }, 4 * 60_000)
}

export function stopPresenceHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
