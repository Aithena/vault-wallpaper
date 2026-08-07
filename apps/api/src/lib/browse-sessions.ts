export type BrowseEventType = 'page' | 'download' | 'login' | 'logout'

export type BrowseEvent = {
  at: string
  type: BrowseEventType
  path: string
  label?: string
  wallpaperId?: string
}

export type BrowseSessionRecord = {
  id: string
  userId: string
  email: string
  startedAt: string
  lastAt: string
  endedAt?: string | null
  endReason?: 'logout' | 'relogin' | 'idle' | null
  events: BrowseEvent[]
}

const USER_INDEX_PREFIX = 'browse_sessions:user:'
const MAX_SESSIONS_PER_USER = 50
const MAX_EVENTS = 120
/** Idle close window when writing next event / listing. */
export const BROWSE_IDLE_MS = 30 * 60 * 1000

function sessionKey(id: string) {
  return `browse_session:${id}`
}

function userIndexKey(userId: string) {
  return `${USER_INDEX_PREFIX}${userId}`
}

async function readUserIndex(kv: KVNamespace, userId: string): Promise<string[]> {
  const raw = await kv.get(userIndexKey(userId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeUserIndex(kv: KVNamespace, userId: string, ids: string[]) {
  await kv.put(userIndexKey(userId), JSON.stringify(ids.slice(0, MAX_SESSIONS_PER_USER)))
}

export async function getBrowseSession(
  kv: KVNamespace,
  id: string,
): Promise<BrowseSessionRecord | null> {
  const raw = await kv.get(sessionKey(id))
  return raw ? (JSON.parse(raw) as BrowseSessionRecord) : null
}

async function saveSession(kv: KVNamespace, session: BrowseSessionRecord) {
  await kv.put(sessionKey(session.id), JSON.stringify(session))
}

export async function endBrowseSession(
  kv: KVNamespace,
  id: string,
  reason: 'logout' | 'relogin' | 'idle',
): Promise<BrowseSessionRecord | null> {
  const session = await getBrowseSession(kv, id)
  if (!session || session.endedAt) return session
  const now = new Date().toISOString()
  session.endedAt = now
  session.lastAt = now
  session.endReason = reason
  if (reason === 'logout') {
    session.events.push({
      at: now,
      type: 'logout',
      path: '/logout',
      label: '退出登录',
    })
    if (session.events.length > MAX_EVENTS) {
      session.events = session.events.slice(-MAX_EVENTS)
    }
  }
  await saveSession(kv, session)
  return session
}

/** Close open sessions for user (e.g. before new login). */
export async function endOpenBrowseSessions(
  kv: KVNamespace,
  userId: string,
  reason: 'logout' | 'relogin' | 'idle',
) {
  const ids = await readUserIndex(kv, userId)
  for (const id of ids.slice(0, 10)) {
    const s = await getBrowseSession(kv, id)
    if (s && !s.endedAt) {
      await endBrowseSession(kv, id, reason)
    }
  }
}

export async function startBrowseSession(
  kv: KVNamespace,
  input: { userId: string; email: string },
): Promise<BrowseSessionRecord> {
  await endOpenBrowseSessions(kv, input.userId, 'relogin')
  const now = new Date().toISOString()
  const session: BrowseSessionRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    email: input.email,
    startedAt: now,
    lastAt: now,
    endedAt: null,
    endReason: null,
    events: [
      {
        at: now,
        type: 'login',
        path: '/login',
        label: '登录成功',
      },
    ],
  }
  await saveSession(kv, session)
  const ids = await readUserIndex(kv, input.userId)
  await writeUserIndex(kv, input.userId, [session.id, ...ids.filter((x) => x !== session.id)])
  return session
}

async function maybeCloseIdle(kv: KVNamespace, session: BrowseSessionRecord) {
  if (session.endedAt) return session
  const last = Date.parse(session.lastAt)
  if (Number.isFinite(last) && Date.now() - last > BROWSE_IDLE_MS) {
    return (await endBrowseSession(kv, session.id, 'idle')) ?? session
  }
  return session
}

export async function appendBrowseEvent(
  kv: KVNamespace,
  input: {
    sessionId: string
    userId: string
    type: BrowseEventType
    path: string
    label?: string
    wallpaperId?: string
  },
): Promise<BrowseSessionRecord | null> {
  let session = await getBrowseSession(kv, input.sessionId)
  if (!session || session.userId !== input.userId) return null
  session = await maybeCloseIdle(kv, session)
  if (session.endedAt) return session

  const now = new Date().toISOString()
  const path = input.path.slice(0, 200)
  const last = session.events[session.events.length - 1]
  // debounce identical page hits within 3s
  if (
    input.type === 'page' &&
    last?.type === 'page' &&
    last.path === path &&
    Date.parse(now) - Date.parse(last.at) < 3000
  ) {
    session.lastAt = now
    await saveSession(kv, session)
    return session
  }

  session.events.push({
    at: now,
    type: input.type,
    path,
    label: input.label?.slice(0, 120),
    wallpaperId: input.wallpaperId,
  })
  if (session.events.length > MAX_EVENTS) {
    session.events = session.events.slice(-MAX_EVENTS)
  }
  session.lastAt = now
  await saveSession(kv, session)
  return session
}

export async function listBrowseSessionsByUser(
  kv: KVNamespace,
  userId: string,
  limit = 20,
): Promise<BrowseSessionRecord[]> {
  const ids = (await readUserIndex(kv, userId)).slice(0, limit)
  const rows: BrowseSessionRecord[] = []
  for (const id of ids) {
    let s = await getBrowseSession(kv, id)
    if (!s) continue
    s = await maybeCloseIdle(kv, s)
    rows.push(s)
  }
  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return rows
}
