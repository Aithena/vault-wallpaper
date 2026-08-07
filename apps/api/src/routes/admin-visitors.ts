import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { paginate, parsePageQuery } from '../lib/paging'
import {
  getVisitorDayStats,
  listVisitorPageviews,
  summarizeVisitorRows,
} from '../lib/visitors'

export const adminVisitorsRoutes = new Hono<AppEnv>()
adminVisitorsRoutes.use('*', requireAdmin)

adminVisitorsRoutes.get('/stats', async (c) => {
  const denied = await requireMenu(c, 'tools.visitors')
  if (denied) return denied

  const q = c.req.query('q')?.trim().toLowerCase()
  const device = c.req.query('device')?.trim()
  const loggedIn = c.req.query('loggedIn')?.trim()
  const dateFrom = c.req.query('dateFrom')?.trim()
  const dateTo = c.req.query('dateTo')?.trim()

  const all = await listVisitorPageviews(c.env.KV, 2000)
  const trend = await getVisitorDayStats(c.env.KV, 14)
  const today = new Date().toISOString().slice(0, 10)
  const todayRows = all.filter((r) => r.at.slice(0, 10) === today)
  const summaryToday = summarizeVisitorRows(todayRows)
  const summaryRecent = summarizeVisitorRows(all)

  let rows = all
  if (device && device !== 'all') {
    rows = rows.filter((r) => r.device === device)
  }
  if (loggedIn === 'yes') rows = rows.filter((r) => Boolean(r.userId))
  else if (loggedIn === 'no') rows = rows.filter((r) => !r.userId)
  if (q) {
    rows = rows.filter(
      (r) =>
        r.visitorId.toLowerCase().includes(q) ||
        r.ip.toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.country || '').toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q),
    )
  }
  if (dateFrom) rows = rows.filter((r) => r.at.slice(0, 10) >= dateFrom)
  if (dateTo) rows = rows.filter((r) => r.at.slice(0, 10) <= dateTo)

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(rows, page, pageSize)

  return c.json({
    today: {
      uv: summaryToday.uv,
      pv: summaryToday.pv,
    },
    recent: {
      uv: summaryRecent.uv,
      pv: summaryRecent.pv,
      byCountry: summaryRecent.byCountry,
      byDevice: summaryRecent.byDevice,
      byPath: summaryRecent.byPath,
    },
    trend,
    records: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})
