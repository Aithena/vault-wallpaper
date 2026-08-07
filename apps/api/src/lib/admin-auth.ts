import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { getAdmin, ensureDefaultAdmin } from './admins'
import { readBearer, verifySession } from './session'

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session || session.role !== 'admin') {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await ensureDefaultAdmin(c.env.KV)
  const admin = await getAdmin(c.env.KV, session.sub)
  if (!admin || admin.status !== 'active') {
    return c.json({ error: 'unauthorized' }, 401)
  }
  c.set('admin', admin)
  await next()
}
