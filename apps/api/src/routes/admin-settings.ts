import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireButton, requireMenu } from '../lib/admin-perm'
import { writeAudit } from '../lib/audit'
import { assertOwned, filterOwned, getActorScope } from '../lib/admin-scope'
import { getSiteConfig, saveSiteConfig } from '../lib/site-config'
import { getTierConfigs, saveTierConfigs, type TierConfigItem } from '../lib/tiers-config'
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from '../lib/announcements'

export const adminSettingsRoutes = new Hono<AppEnv>()
adminSettingsRoutes.use('*', requireAdmin)

adminSettingsRoutes.get('/site', async (c) => {
  const denied = await requireMenu(c, 'settings.site')
  if (denied) return denied
  return c.json({ config: await getSiteConfig(c.env.KV) })
})

adminSettingsRoutes.put('/site', async (c) => {
  const denied = await requireButton(c, 'settings.site.save')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    siteName: string
    domain: string
    purchaseNotice: string
    copyright: string
    purchaseEnabled: boolean
  }>
  const config = await saveSiteConfig(c.env.KV, body)
  const admin = c.get('admin')!
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'settings.site.save',
    target: 'site:config',
  })
  return c.json({ ok: true, config })
})

adminSettingsRoutes.get('/tiers', async (c) => {
  const denied = await requireMenu(c, 'settings.tiers')
  if (denied) return denied
  return c.json({ tiers: await getTierConfigs(c.env.KV) })
})

adminSettingsRoutes.put('/tiers', async (c) => {
  const denied = await requireButton(c, 'settings.tiers.save')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as { tiers?: TierConfigItem[] }
  if (!body.tiers || !Array.isArray(body.tiers)) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  const tiers = await saveTierConfigs(c.env.KV, body.tiers)
  const admin = c.get('admin')!
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'settings.tiers.save',
    target: 'site:tiers',
  })
  return c.json({ ok: true, tiers })
})

adminSettingsRoutes.get('/announcements', async (c) => {
  const denied = await requireMenu(c, 'settings.announcements')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const announcements = filterOwned(
    await listAnnouncements(c.env.KV),
    scope,
    admin.id,
  )
  return c.json({ announcements })
})

adminSettingsRoutes.post('/announcements', async (c) => {
  const denied = await requireButton(c, 'settings.announcements.create')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    content?: string
    status?: 'draft' | 'published'
  }
  if (!body.title?.trim()) return c.json({ error: 'invalid_payload' }, 400)
  const admin = c.get('admin')!
  const announcement = await createAnnouncement(c.env.KV, {
    title: body.title,
    content: body.content,
    status: body.status,
    createdByAdminId: admin.id,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'settings.announcements.create',
    target: `announcement:${announcement.id}`,
  })
  return c.json({ ok: true, announcement }, 201)
})

adminSettingsRoutes.patch('/announcements/:id', async (c) => {
  const denied = await requireButton(c, 'settings.announcements.edit')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const existing = await getAnnouncement(c.env.KV, c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    content?: string
    status?: 'draft' | 'published'
  }
  const announcement = await updateAnnouncement(c.env.KV, c.req.param('id'), body)
  if (!announcement) return c.json({ error: 'not_found' }, 404)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'settings.announcements.edit',
    target: `announcement:${announcement.id}`,
  })
  return c.json({ ok: true, announcement })
})

adminSettingsRoutes.delete('/announcements/:id', async (c) => {
  const denied = await requireButton(c, 'settings.announcements.delete')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const existing = await getAnnouncement(c.env.KV, c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const ok = await deleteAnnouncement(c.env.KV, c.req.param('id'))
  if (!ok) return c.json({ error: 'not_found' }, 404)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'settings.announcements.delete',
    target: `announcement:${c.req.param('id')}`,
  })
  return c.json({ ok: true })
})
