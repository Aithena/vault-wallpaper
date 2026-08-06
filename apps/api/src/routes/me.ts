import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readBearer, verifySession } from '../lib/session'
import { getUser, toSessionUser } from '../lib/users'

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/', async (c) => {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ user: null })
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ user: null })

  const user = await getUser(c.env.KV, session.sub)
  if (!user) return c.json({ user: null })

  return c.json({ user: toSessionUser(user) })
})
