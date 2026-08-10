import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readBearer, verifySession } from '../lib/session'
import { getUser } from '../lib/users'
import {
  geoFromCf,
  parseUserAgent,
  writeVisitorPageview,
} from '../lib/visitors'

export const analyticsRoutes = new Hono<AppEnv>()

analyticsRoutes.post('/pageview', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      visitorId?: string
      path?: string
      label?: string
    }
    const visitorId = body.visitorId?.trim()
    const path = body.path?.trim()
    if (!visitorId || visitorId.length < 8 || !path) {
      return c.json({ error: 'invalid_payload' }, 400)
    }

    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    const ua = c.req.header('user-agent') || ''
    const parsed = parseUserAgent(ua)
    const geo = geoFromCf(c.req.raw.cf as IncomingRequestCfProperties | undefined)

    let userId: string | null = null
    let email: string | null = null
    const token = readBearer(c.req.header('Authorization'))
    if (token && c.env.JWT_SECRET) {
      try {
        const session = await verifySession(c.env.JWT_SECRET, token)
        if (session && session.role !== 'admin') {
          userId = session.sub
          email = session.email
          const user = await getUser(c.env.KV, session.sub)
          if (user) email = user.email
        }
      } catch {
        /* ignore bad tokens */
      }
    }

    await writeVisitorPageview(c.env.KV, {
      visitorId,
      path,
      label: body.label,
      ip,
      ...geo,
      ...parsed,
      userAgent: ua,
      userId,
      email,
    })

    return c.json({ ok: true })
  } catch (err) {
    console.error('analytics/pageview failed', err)
    // Analytics must not break the site; acknowledge soft failure.
    return c.json({ ok: false, error: 'pageview_failed' }, 200)
  }
})
