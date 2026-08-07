import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  authenticateAdmin,
  ensureDefaultAdmin,
  findAdminByEmail,
  loadAdminWithRole,
  sessionEmailForAdmin,
  setAdminPassword,
  toAdminPublic,
} from '../lib/admins'
import { requireAdmin } from '../lib/admin-auth'
import {
  canSendEmailCode,
  generateCode,
  isValidEmail,
  sendEmailCode,
  storeEmailCode,
  verifyEmailCode,
  formatCfLocation,
  formatLoginTime,
} from '../lib/email-code'
import { signSession } from '../lib/session'

export const adminAuthRoutes = new Hono<AppEnv>()

adminAuthRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string
    password?: string
  }
  const username = body.username?.trim()
  const password = body.password ?? ''
  if (!username || !password) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'server_misconfigured' }, 500)
  }

  const admin = await authenticateAdmin(c.env.KV, username, password)
  if (!admin) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  const { role } = await loadAdminWithRole(c.env.KV, admin)
  const token = await signSession(c.env.JWT_SECRET, {
    sub: admin.id,
    email: sessionEmailForAdmin(admin),
    role: 'admin',
    username: admin.username,
  })

  return c.json({ ok: true, token, admin: toAdminPublic(admin, role, true) })
})

adminAuthRoutes.post('/reset-request', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string }
  const email = body.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return c.json({ error: 'invalid_email' }, 400)
  }

  await ensureDefaultAdmin(c.env.KV)
  const admin = await findAdminByEmail(c.env.KV, email)
  if (!admin || admin.status !== 'active') {
    return c.json({ ok: true, delivered: false })
  }

  const ok = await canSendEmailCode(c.env.KV, email)
  if (!ok) return c.json({ error: 'too_frequent' }, 429)

  const code = generateCode()
  await storeEmailCode(c.env.KV, email, code)

  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '未知'
  const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined

  try {
    const result = await sendEmailCode(c.env, email, code, {
      ip,
      location: formatCfLocation(cf),
      timeText: formatLoginTime(),
    })
    return c.json({
      ok: true,
      delivered: result.delivered,
      previewCode: result.previewCode,
      emailId: result.id,
    })
  } catch (e) {
    console.error('[admin reset-request]', e)
    return c.json({ error: 'email_send_failed' }, 502)
  }
})

adminAuthRoutes.post('/reset-confirm', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string
    code?: string
    newPassword?: string
  }
  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()
  const newPassword = body.newPassword ?? ''
  if (!email || !isValidEmail(email) || !code) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  if (newPassword.length < 6) {
    return c.json({ error: 'invalid_password' }, 400)
  }

  await ensureDefaultAdmin(c.env.KV)
  const admin = await findAdminByEmail(c.env.KV, email)
  if (!admin) return c.json({ error: 'invalid_code' }, 400)

  const valid = await verifyEmailCode(c.env.KV, email, code)
  if (!valid) return c.json({ error: 'invalid_code' }, 400)

  const result = await setAdminPassword(c.env.KV, admin.id, newPassword)
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ ok: true })
})

adminAuthRoutes.get('/me', requireAdmin, async (c) => {
  const admin = c.get('admin')!
  const { role } = await loadAdminWithRole(c.env.KV, admin)
  return c.json({ admin: toAdminPublic(admin, role, true) })
})
