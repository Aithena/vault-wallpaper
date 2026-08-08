import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import {
  getIntegrationLog,
  listIntegrationLogs,
} from '../lib/integration-logs'
import { inDateRange, resolveDateRange } from '../lib/date-range'
import { paginate, parsePageQuery } from '../lib/paging'

export const adminIntegrationLogsRoutes = new Hono<AppEnv>()
adminIntegrationLogsRoutes.use('*', requireAdmin)

adminIntegrationLogsRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'tools.integration_logs')
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const provider = c.req.query('provider')?.trim()
  const ok = c.req.query('ok')?.trim()
  const q = c.req.query('q')?.trim().toLowerCase()

  let rows = (await listIntegrationLogs(c.env.KV, 3000)).filter((r) =>
    inDateRange(r.createdAt, range.from, range.to),
  )
  if (provider && provider !== 'all') {
    rows = rows.filter((r) => r.provider === provider)
  }
  if (ok === '1') rows = rows.filter((r) => r.ok)
  if (ok === '0') rows = rows.filter((r) => !r.ok)
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.id,
        r.provider,
        r.action,
        r.refType || '',
        r.refId || '',
        r.error || '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(rows, page, pageSize)

  return c.json({
    records: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    range: { from: range.from, to: range.to, days: range.days },
  })
})

adminIntegrationLogsRoutes.get('/:id', async (c) => {
  const denied = await requireMenu(c, 'tools.integration_logs')
  if (denied) return denied
  const row = await getIntegrationLog(c.env.KV, c.req.param('id'))
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ record: row })
})
