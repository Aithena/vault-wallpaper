import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { canAccessTier } from '../lib/catalog'
import {
  ensureSeedCatalog,
  getWallpaper,
  listPublishedWallpapers,
  toPublicWallpaper,
  listCategories,
  listTags,
} from '../lib/wallpaper-catalog'
import { migrateWallpaperIdsIfNeeded } from '../lib/migrate-wallpaper-ids'
import { getPreviewObject, originalKey } from '../lib/r2-wallpaper'
import { writeDownload } from '../lib/downloads'
import { readBearer, verifySession } from '../lib/session'
import { getUser, isUserMembershipActive } from '../lib/users'
import { appendBrowseEvent } from '../lib/browse-sessions'
import { touchPresence } from '../lib/presence'

export const wallpaperRoutes = new Hono<AppEnv>()

wallpaperRoutes.get('/', async (c) => {
  await ensureSeedCatalog(c.env.KV)
  await migrateWallpaperIdsIfNeeded(c.env.KV, c.env.R2)
  const [items, cats, tags] = await Promise.all([
    listPublishedWallpapers(c.env.KV),
    listCategories(c.env.KV),
    listTags(c.env.KV),
  ])
  const catMap = new Map(cats.map((c) => [c.id, c.name]))
  const tagMap = new Map(tags.map((t) => [t.id, t.name]))
  return c.json({
    items: items.map((w) =>
      toPublicWallpaper(
        w,
        w.categoryId ? catMap.get(w.categoryId) : null,
        w.tagIds.map((id) => tagMap.get(id)).filter(Boolean) as string[],
      ),
    ),
    categories: cats,
    tags,
  })
})

wallpaperRoutes.get('/:id/preview', async (c) => {
  const id = c.req.param('id')
  const object = await getPreviewObject(c.env.R2, id)
  if (!object) return c.json({ error: 'not_found' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=86400')
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
