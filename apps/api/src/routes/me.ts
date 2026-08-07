import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { readBearer, verifySession } from '../lib/session'
import { getUser, toSessionUser, type UserRecord } from '../lib/users'
import { clearPresence, touchPresence } from '../lib/presence'
import {
  appendBrowseEvent,
  endBrowseSession,
  type BrowseEventType,
} from '../lib/browse-sessions'

export const meRoutes = new Hono<AppEnv>()

async function requireUser(c: Context<AppEnv>): Promise<UserRecord | null> {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) return null
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session || session.role === 'admin') return null
  const user = await getUser(c.env.KV, session.sub)
  if (!user || user.accountStatus === 'disabled') return null
  return user
}

meRoutes.get('/', async (c) => {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ user: null })
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ user: null })

  const user = await getUser(c.env.KV, session.sub)
  if (!user) return c.json({ user: null })

  return c.json({ user: toSessionUser(user) })
})

/** Heartbeat for approximate online presence. */
meRoutes.post('/presence', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as { path?: string }
  const record = await touchPresence(c.env.KV, user, body.path)
  return c.json({ ok: true, lastSeenAt: record.lastSeenAt })
})

/** Append browse path event for current login session. */
meRoutes.post('/track', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as {
    sessionId?: string
    type?: BrowseEventType
    path?: string
    label?: string
    wallpaperId?: string
  }
  if (!body.sessionId?.trim() || !body.path?.trim()) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  const type = body.type === 'download' ? 'download' : 'page'
  const session = await appendBrowseEvent(c.env.KV, {
    sessionId: body.sessionId.trim(),
    userId: user.id,
    type,
    path: body.path,
    label: body.label,
    wallpaperId: body.wallpaperId,
  })
  if (!session) return c.json({ error: 'session_not_found' }, 404)
  // keep presence warm while browsing
  await touchPresence(c.env.KV, user, body.path)
  return c.json({
    ok: true,
    ended: Boolean(session.endedAt),
    endReason: session.endReason ?? null,
  })
})

meRoutes.post('/logout', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.json({ ok: true })
  const body = (await c.req.json().catch(() => ({}))) as { sessionId?: string }
  if (body.sessionId?.trim()) {
    await endBrowseSession(c.env.KV, body.sessionId.trim(), 'logout')
  }
  await clearPresence(c.env.KV, user.id)
  return c.json({ ok: true })
})
