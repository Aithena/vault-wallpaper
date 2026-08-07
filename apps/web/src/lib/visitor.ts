const VISITOR_KEY = 'vault_visitor_id'

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id || id.length < 8) {
    id = randomId()
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}
