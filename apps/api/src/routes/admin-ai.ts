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

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'

/**
 * OpenAI-compatible streaming proxy for AiEditor.
 * Client sends admin JWT as Bearer; we attach DEEPSEEK_API_KEY upstream.
 */
adminAiRoutes.post('/v1/chat/completions', async (c) => {
  const apiKey = c.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    return c.json({ error: 'deepseek_not_configured' }, 503)
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value == null) continue
    body[key] = value
  }

  const model =
    (typeof body.model === 'string' && body.model.trim()) ||
    c.env.DEEPSEEK_MODEL?.trim() ||
    DEFAULT_DEEPSEEK_MODEL
  body.model = model
  body.stream = true
  // V4 Flash defaults to thinking on; disable for snappy editor edits.
  if (body.thinking == null) {
    body.thinking = { type: 'disabled' }
  }

  const upstream = await fetch(DEEPSEEK_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const headers = new Headers()
  const contentType = upstream.headers.get('Content-Type')
  if (contentType) headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'no-cache')

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
})

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
