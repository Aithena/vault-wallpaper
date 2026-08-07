import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { listAudits } from '../lib/audit'

export const adminAuditRoutes = new Hono<AppEnv>()
adminAuditRoutes.use('*', requireAdmin)

adminAuditRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'tools.audit')
  if (denied) return denied
  const limit = Number(c.req.query('limit') || '200')
  const logs = await listAudits(c.env.KV, Number.isFinite(limit) ? limit : 200)
  return c.json({ logs })
})
