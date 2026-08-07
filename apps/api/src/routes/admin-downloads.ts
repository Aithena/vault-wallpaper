import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { listDownloads } from '../lib/downloads'

export const adminDownloadsRoutes = new Hono<AppEnv>()
adminDownloadsRoutes.use('*', requireAdmin)

adminDownloadsRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.downloads')
  if (denied) return denied
  const limit = Number(c.req.query('limit') || '200')
  const downloads = await listDownloads(
    c.env.KV,
    Number.isFinite(limit) ? Math.min(limit, 1000) : 200,
  )
  return c.json({ downloads })
})
