import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { resolveDateRange } from '../lib/date-range'
import {
  fetchAiDaily,
  fetchKvDailyOperations,
  fetchR2Daily,
  fetchWorkersDaily,
  KV_FREE_DAILY_CAPS,
  R2_FREE_MONTHLY_CAPS,
  WORKERS_FREE_DAILY_CAPS,
} from '../lib/cf-analytics'

export const adminCloudflareRoutes = new Hono<AppEnv>()
adminCloudflareRoutes.use('*', requireAdmin)

function creds(c: { env: AppEnv['Bindings'] }) {
  const accountId = c.env.CF_ACCOUNT_ID?.trim()
  const apiToken = c.env.CF_API_TOKEN?.trim()
  return { accountId, apiToken }
}

function notConfigured() {
  return {
    error: 'cloudflare_not_configured',
    hint: '请配置 CF_ACCOUNT_ID（vars）与 CF_API_TOKEN（secret，需 Account Analytics Read）',
    configured: false,
  }
}

adminCloudflareRoutes.get('/kv-usage', async (c) => {
  const denied = await requireMenu(c, 'tools.cloudflare')
  if (denied) return denied

  const { accountId, apiToken } = creds(c)
  const namespaceId =
    c.env.CF_KV_NAMESPACE_ID?.trim() || '3ff6aac757d44bd0baf041b1cba43d38'
  if (!accountId || !apiToken) {
    return c.json({ ...notConfigured(), caps: KV_FREE_DAILY_CAPS }, 503)
  }

  const range = resolveDateRange({
    days: c.req.query('days') || '14',
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    maxDays: 31,
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const days = await fetchKvDailyOperations({
      accountId,
      apiToken,
      namespaceId,
      dateFrom: range.from,
      dateTo: range.to,
    })
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = days.find((d) => d.date === today) || {
      date: today,
      read: 0,
      write: 0,
      delete: 0,
      list: 0,
    }
    return c.json({
      configured: true,
      namespaceId,
      caps: KV_FREE_DAILY_CAPS,
      today: todayRow,
      days,
      range: { from: range.from, to: range.to, days: range.days },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cloudflare_fetch_failed'
    return c.json({ error: 'cloudflare_fetch_failed', detail: msg }, 502)
  }
})

adminCloudflareRoutes.get('/workers-usage', async (c) => {
  const denied = await requireMenu(c, 'tools.cloudflare')
  if (denied) return denied

  const { accountId, apiToken } = creds(c)
  const scriptName = c.env.CF_WORKER_SCRIPT_NAME?.trim() || 'vault-wallpaper-api'
  if (!accountId || !apiToken) {
    return c.json({ ...notConfigured(), caps: WORKERS_FREE_DAILY_CAPS }, 503)
  }

  const range = resolveDateRange({
    days: c.req.query('days') || '14',
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    maxDays: 31,
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const days = await fetchWorkersDaily({
      accountId,
      apiToken,
      scriptName,
      dateFrom: range.from,
      dateTo: range.to,
    })
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = days.find((d) => d.date === today) || {
      date: today,
      requests: 0,
      errors: 0,
      subrequests: 0,
    }
    return c.json({
      configured: true,
      scriptName,
      caps: WORKERS_FREE_DAILY_CAPS,
      today: todayRow,
      days,
      range: { from: range.from, to: range.to, days: range.days },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cloudflare_fetch_failed'
    return c.json({ error: 'cloudflare_fetch_failed', detail: msg }, 502)
  }
})

adminCloudflareRoutes.get('/r2-usage', async (c) => {
  const denied = await requireMenu(c, 'tools.cloudflare')
  if (denied) return denied

  const { accountId, apiToken } = creds(c)
  const bucketName = c.env.CF_R2_BUCKET_NAME?.trim() || 'awall-wallpaper'
  if (!accountId || !apiToken) {
    return c.json({ ...notConfigured(), caps: R2_FREE_MONTHLY_CAPS }, 503)
  }

  const range = resolveDateRange({
    days: c.req.query('days') || '14',
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    maxDays: 31,
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const { days, storage } = await fetchR2Daily({
      accountId,
      apiToken,
      bucketName,
      dateFrom: range.from,
      dateTo: range.to,
    })
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = days.find((d) => d.date === today) || {
      date: today,
      classA: 0,
      classB: 0,
      other: 0,
    }
    return c.json({
      configured: true,
      bucketName,
      caps: R2_FREE_MONTHLY_CAPS,
      storage,
      today: todayRow,
      days,
      range: { from: range.from, to: range.to, days: range.days },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cloudflare_fetch_failed'
    return c.json({ error: 'cloudflare_fetch_failed', detail: msg }, 502)
  }
})

adminCloudflareRoutes.get('/ai-usage', async (c) => {
  const denied = await requireMenu(c, 'tools.cloudflare')
  if (denied) return denied

  const { accountId, apiToken } = creds(c)
  if (!accountId || !apiToken) {
    return c.json(notConfigured(), 503)
  }

  const range = resolveDateRange({
    days: c.req.query('days') || '14',
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    maxDays: 31,
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const days = await fetchAiDaily({
      accountId,
      apiToken,
      dateFrom: range.from,
      dateTo: range.to,
    })
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = days.find((d) => d.date === today) || {
      date: today,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    }
    return c.json({
      configured: true,
      today: todayRow,
      days,
      range: { from: range.from, to: range.to, days: range.days },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cloudflare_fetch_failed'
    return c.json({ error: 'cloudflare_fetch_failed', detail: msg }, 502)
  }
})
