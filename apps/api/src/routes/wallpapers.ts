import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { canAccessTier } from '../lib/catalog'
import {
  ensureSeedCatalog,
  getWallpaper,
  getPublicCatalogSnapshot,
} from '../lib/wallpaper-catalog'
import { migrateWallpaperIdsIfNeeded } from '../lib/migrate-wallpaper-ids'
import { originalKey, resolvePreviewObject } from '../lib/r2-wallpaper'
import { parsePreviewSize } from '../lib/image-resize'
import { writeDownload } from '../lib/downloads'
import { readBearer, verifySession } from '../lib/session'
import { getUser, isUserMembershipActive } from '../lib/users'
import { appendBrowseEvent } from '../lib/browse-sessions'
import { touchPresence } from '../lib/presence'

export const wallpaperRoutes = new Hono<AppEnv>()

wallpaperRoutes.get('/', async (c) => {
  await ensureSeedCatalog(c.env.KV)
  await migrateWallpaperIdsIfNeeded(c.env.KV, c.env.R2)
  const snap = await getPublicCatalogSnapshot(c.env.KV)
  return c.json({
    items: snap.items,
    categories: snap.categories,
    tags: snap.tags,
  })
})

wallpaperRoutes.get('/:id/preview', async (c) => {
  const id = c.req.param('id')
  const size = parsePreviewSize(c.req.query('size'))
  const object = await resolvePreviewObject(c.env.R2, c.env.IMAGES, id, size, {
    cacheMissing: size !== 'full',
  })
  if (!object) return c.json({ error: 'not_found' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=86400')
  // Allow cross-origin <img> from admin.awall.cc / awall.cc
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  // Vary by size so CDNs don't mix variants
  headers.set('Vary', 'Accept')
  return new Response(object.body, { headers })
})

wallpaperRoutes.get('/:id/download', async (c) => {
  const id = c.req.param('id')
  await ensureSeedCatalog(c.env.KV)
  await migrateWallpaperIdsIfNeeded(c.env.KV, c.env.R2)
  const item = await getWallpaper(c.env.KV, id)
  if (!item || item.deletedAt || item.status !== 'published') {
    return c.json({ error: 'not_found' }, 404)
  }

  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const user = await getUser(c.env.KV, session.sub)
  if (!user || user.accountStatus === 'disabled') {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const logBase = {
    userId: user.id,
    email: user.email,
    wallpaperId: item.id,
    wallpaperTitle: item.title,
    tierAtTime: user.memberTier,
  }

  if (user.blacklisted) {
    await writeDownload(c.env.KV, {
      ...logBase,
      success: false,
      error: 'blacklisted',
    })
    return c.json({ error: 'forbidden' }, 403)
  }

  if (!isUserMembershipActive(user)) {
    await writeDownload(c.env.KV, {
      ...logBase,
      success: false,
      error: 'membership_required',
    })
    return c.json({ error: 'membership_required' }, 403)
  }
  if (!canAccessTier(user.memberTier, item.tierRequired)) {
    await writeDownload(c.env.KV, {
      ...logBase,
      success: false,
      error: 'tier_insufficient',
    })
    return c.json({ error: 'tier_insufficient' }, 403)
  }

  const object = c.env.R2 ? await c.env.R2.get(originalKey(id)) : null
  if (!object) {
    await writeDownload(c.env.KV, {
      ...logBase,
      success: false,
      error: 'original_missing',
    })
    return c.json(
      {
        error: 'original_missing',
        hint: 'Upload originals/{id}.jpg via admin or wrangler r2 object put',
      },
      404,
    )
  }

  await writeDownload(c.env.KV, {
    ...logBase,
    success: true,
  })

  const browseSessionId = c.req.header('x-browse-session-id')?.trim()
  if (browseSessionId) {
    await appendBrowseEvent(c.env.KV, {
      sessionId: browseSessionId,
      userId: user.id,
      type: 'download',
      path: `/wallpapers/${id}/download`,
      label: `下载 ${item.title}`,
      wallpaperId: id,
    })
    await touchPresence(c.env.KV, user, `/wallpapers/${id}`)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Content-Disposition', `attachment; filename="${id}.jpg"`)
  headers.set('Cache-Control', 'private, no-store')

  return new Response(object.body, { headers })
})
