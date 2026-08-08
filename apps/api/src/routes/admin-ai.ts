import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import {
  listAiUsage,
  summarizeAiUsage,
  type AiUsageRecord,
} from '../lib/ai-usage'
import {
  buildDayKeys,
  inDateRange,
  resolveDateRange,
} from '../lib/date-range'
import { paginate, parsePageQuery } from '../lib/paging'

export const adminAiRoutes = new Hono<AppEnv>()
adminAiRoutes.use('*', requireAdmin)

function trendInRange(rows: AiUsageRecord[], from: string, to: string) {
  return buildDayKeys(from, to).map((date) => {
    const day = rows.filter((r) => r.createdAt.slice(0, 10) === date)
    return {
      date,
      total: day.length,
      success: day.filter((r) => r.status === 'success').length,
      failed: day.filter((r) => r.status === 'failed').length,
    }
  })
}

adminAiRoutes.get('/usage', async (c) => {
  const denied = await requireMenu(c, 'tools.ai_usage')
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const status = c.req.query('status')?.trim()
  const trigger = c.req.query('trigger')?.trim()
  const q = c.req.query('q')?.trim().toLowerCase()

  const all = (await listAiUsage(c.env.KV, 2000)).filter((r) =>
    inDateRange(r.createdAt, range.from, range.to),
  )
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

  const summary = summarizeAiUsage(all, range.to)
  const trend = trendInRange(all, range.from, range.to)
  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(rows, page, pageSize)

  return c.json({
    summary,
    trend,
    records: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    range: { from: range.from, to: range.to, days: range.days },
  })
})
