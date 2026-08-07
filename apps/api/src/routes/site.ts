import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { listAnnouncements } from '../lib/announcements'
import { getSiteConfig } from '../lib/site-config'
import { getTierConfigs } from '../lib/tiers-config'

export const siteRoutes = new Hono<AppEnv>()

siteRoutes.get('/', async (c) => {
  const config = await getSiteConfig(c.env.KV)
  return c.json({
    config: {
      siteName: config.siteName,
      domain: config.domain,
      purchaseNotice: config.purchaseNotice,
      copyright: config.copyright,
      purchaseEnabled: config.purchaseEnabled,
    },
  })
})

siteRoutes.get('/tiers', async (c) => {
  const tiers = await getTierConfigs(c.env.KV)
  return c.json({
    tiers: tiers.filter((t) => t.onSale !== false),
  })
})

siteRoutes.get('/announcements', async (c) => {
  const all = await listAnnouncements(c.env.KV)
  return c.json({
    announcements: all
      .filter((a) => a.status === 'published')
      .map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        updatedAt: a.updatedAt,
      })),
  })
})
