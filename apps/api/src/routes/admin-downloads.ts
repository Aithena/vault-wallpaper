import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { listDownloads } from '../lib/downloads'
import { paginate, parsePageQuery } from '../lib/paging'

export const adminDownloadsRoutes = new Hono<AppEnv>()
adminDownloadsRoutes.use('*', requireAdmin)

adminDownloadsRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.downloads')
  if (denied) return denied
  const q = c.req.query('q')?.trim().toLowerCase()
  const success = c.req.query('success')?.trim()
  const dateFrom = c.req.query('dateFrom')?.trim()
  const dateTo = c.req.query('dateTo')?.trim()

  let downloads = await listDownloads(c.env.KV, 5000)
  if (success === 'yes') downloads = downloads.filter((d) => d.success)
  else if (success === 'no') downloads = downloads.filter((d) => !d.success)
  if (q) {
    downloads = downloads.filter(
      (d) =>
        d.email.toLowerCase().includes(q) ||
        d.wallpaperId.toLowerCase().includes(q) ||
        d.wallpaperTitle.toLowerCase().includes(q),
    )
  }
  if (dateFrom) {
    downloads = downloads.filter((d) => d.createdAt.slice(0, 10) >= dateFrom)
  }
  if (dateTo) {
    downloads = downloads.filter((d) => d.createdAt.slice(0, 10) <= dateTo)
  }

  const { page, pageSize } = parsePageQuery(c.req.query(), {
    pageSize: 20,
    maxPageSize: 100,
  })
  const paged = paginate(downloads, page, pageSize)
  return c.json({
    downloads: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})
