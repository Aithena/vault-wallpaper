import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import {
  listAiUsage,
  summarizeAiUsage,
  trendAiUsage,
} from '../lib/ai-usage'
import { paginate, parsePageQuery } from '../lib/paging'

export const adminAiRoutes = new Hono<AppEnv>()
adminAiRoutes.use('*', requireAdmin)

adminAiRoutes.get('/usage', async (c) => {
  const denied = await requireMenu(c, 'tools.ai_usage')
  if (denied) return denied

  const status = c.req.query('status')?.trim()
  const trigger = c.req.query('trigger')?.trim()
  const q = c.req.query('q')?.trim().toLowerCase()
  const dateFrom = c.req.query('dateFrom')?.trim()
  const dateTo = c.req.query('dateTo')?.trim()

  const all = await listAiUsage(c.env.KV, 2000)
  let rows = all
  if (status && status !== 'all') {
    rows = rows.filter((r) => r.status === status)
  }
  if (trigger && trigger !== 'all') {
    rows = rows.filter((r) => r.trigger === trigger)
  }
  if (q) {
    rows = rows.filter(
      (r) =>
        r.wallpaperId.toLowerCase().includes(q) ||
        r.wallpaperTitle.toLowerCase().includes(q) ||
        (r.adminUsername || '').toLowerCase().includes(q) ||
        (r.error || '').toLowerCase().includes(q),
    )
  }
  if (dateFrom) {
    rows = rows.filter((r) => r.createdAt.slice(0, 10) >= dateFrom)
  }
  if (dateTo) {
    rows = rows.filter((r) => r.createdAt.slice(0, 10) <= dateTo)
  }

  const summary = summarizeAiUsage(all)
  const trend = trendAiUsage(all, 30)
  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(rows, page, pageSize)

  return c.json({
    summary,
    trend,
    records: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})
