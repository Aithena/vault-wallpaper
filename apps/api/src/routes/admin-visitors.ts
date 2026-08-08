import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { inDateRange, resolveDateRange } from '../lib/date-range'
import { paginate, parsePageQuery } from '../lib/paging'
import {
  getVisitorDayStatsRange,
  listVisitorPageviews,
  summarizeVisitorRows,
} from '../lib/visitors'

export const adminVisitorsRoutes = new Hono<AppEnv>()
adminVisitorsRoutes.use('*', requireAdmin)

adminVisitorsRoutes.get('/stats', async (c) => {
  const denied = await requireMenu(c, 'tools.visitors')
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const q = c.req.query('q')?.trim().toLowerCase()
  const device = c.req.query('device')?.trim()
  const loggedIn = c.req.query('loggedIn')?.trim()

  const all = (await listVisitorPageviews(c.env.KV, 2000)).filter((r) =>
    inDateRange(r.at, range.from, range.to),
  )
  const trend = await getVisitorDayStatsRange(c.env.KV, range.from, range.to)
  const today = new Date().toISOString().slice(0, 10)
  const todayBucket = trend.find((d) => d.date === today) || { uv: 0, pv: 0 }
  const rangePv = trend.reduce((sum, d) => sum + d.pv, 0)
  const rangeUvApprox = trend.reduce((sum, d) => sum + d.uv, 0)
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

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(rows, page, pageSize)

  return c.json({
    today: {
      uv: todayBucket.uv,
      pv: todayBucket.pv,
    },
    recent: {
      // Prefer day-bucket totals for UV/PV; breakdowns still from detail rows.
      uv: rangeUvApprox || summaryRecent.uv,
      pv: rangePv || summaryRecent.pv,
      byCountry: summaryRecent.byCountry,
      byDevice: summaryRecent.byDevice,
      byPath: summaryRecent.byPath,
    },
    trend,
    records: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    range: { from: range.from, to: range.to, days: range.days },
  })
})
