const BROWSE_SESSION_KEY = 'vault_browse_session'

export function getBrowseSessionId(): string | null {
  return localStorage.getItem(BROWSE_SESSION_KEY)
}

export function setBrowseSessionId(id: string) {
  localStorage.setItem(BROWSE_SESSION_KEY, id)
}

export function clearBrowseSessionId() {
  localStorage.removeItem(BROWSE_SESSION_KEY)
}
