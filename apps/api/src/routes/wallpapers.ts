import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { canAccessTier, SEED_WALLPAPERS } from '../lib/catalog'
import { readBearer, verifySession } from '../lib/session'
import { getUser } from '../lib/users'

export const wallpaperRoutes = new Hono<AppEnv>()

wallpaperRoutes.get('/', (c) => {
  return c.json({ items: SEED_WALLPAPERS })
})

/**
 * Authenticated download proxy.
 * Original object lives in R2 (key: originals/{id}.jpg). Never expose raw R2 URL to client.
 */
wallpaperRoutes.get('/:id/download', async (c) => {
  const id = c.req.param('id')
  const item = SEED_WALLPAPERS.find((w) => w.id === id)
  if (!item) return c.json({ error: 'not_found' }, 404)

  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const user = await getUser(c.env.KV, session.sub)
  if (!user || user.memberStatus !== 'active') {
    return c.json({ error: 'membership_required' }, 403)
  }
  if (!canAccessTier(user.memberTier, item.tierRequired)) {
    return c.json({ error: 'tier_insufficient' }, 403)
  }

  const object = c.env.R2
    ? await c.env.R2.get(`originals/${id}.jpg`)
    : null
  if (!object) {
    return c.json(
      {
        error: 'original_missing',
        hint: 'Enable R2, create bucket awall-wallpaper, upload originals/{id}.jpg',
      },
      404,
    )
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set(
    'Content-Disposition',
    `attachment; filename="${id}.jpg"`,
  )
  headers.set('Cache-Control', 'private, no-store')

  return new Response(object.body, { headers })
})
