import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { filterAuditByAdmin, getActorScope } from '../lib/admin-scope'
import { listAudits } from '../lib/audit'
import { paginate, parsePageQuery } from '../lib/paging'

export const adminAuditRoutes = new Hono<AppEnv>()
adminAuditRoutes.use('*', requireAdmin)

adminAuditRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'tools.audit')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const logs = await listAudits(c.env.KV, 2000)
  const scoped = filterAuditByAdmin(logs, scope, admin.id)
  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(scoped, page, pageSize)
  return c.json({
    logs: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})
