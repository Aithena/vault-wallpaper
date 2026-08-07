import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireButton, requireMenu } from '../lib/admin-perm'
import { writeAudit } from '../lib/audit'
import {
  addToBlacklist,
  listBlacklist,
  removeFromBlacklist,
} from '../lib/blacklist'
import { writeUserLog } from '../lib/user-logs'

export const adminBlacklistRoutes = new Hono<AppEnv>()
adminBlacklistRoutes.use('*', requireAdmin)

adminBlacklistRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'users.blacklist')
  if (denied) return denied
  return c.json({ items: await listBlacklist(c.env.KV) })
})

adminBlacklistRoutes.post('/', async (c) => {
  const denied = await requireButton(c, 'users.blacklist.create')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string
    reason?: string
  }
  if (!body.email?.trim()) return c.json({ error: 'invalid_payload' }, 400)

  const admin = c.get('admin')!
  const result = await addToBlacklist(c.env.KV, {
    email: body.email,
    reason: body.reason,
    operatorId: admin.id,
    operator: admin.username,
  })
  if (!result.ok) {
    const status = result.error === 'user_not_found' ? 404 : 400
    return c.json({ error: result.error }, status)
  }

  await writeUserLog(c.env.KV, {
    userId: result.user.id,
    action: 'user.blacklist',
    detail: result.entry.reason,
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'users.blacklist.create',
    target: `user:${result.user.id}`,
    detail: result.entry.reason,
  })

  return c.json({ ok: true, item: result.entry }, 201)
})

adminBlacklistRoutes.delete('/:userId', async (c) => {
  const denied = await requireButton(c, 'users.blacklist.remove')
  if (denied) return denied
  const userId = c.req.param('userId')
  const result = await removeFromBlacklist(c.env.KV, userId)
  if (!result.ok) return c.json({ error: result.error }, 404)

  const admin = c.get('admin')!
  await writeUserLog(c.env.KV, {
    userId,
    action: 'user.unblacklist',
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'users.blacklist.remove',
    target: `user:${userId}`,
  })

  return c.json({ ok: true })
})
