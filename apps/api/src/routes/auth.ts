import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  canSendEmailCode,
  formatCfLocation,
  formatLoginTime,
  generateCode,
  isValidEmail,
  sendEmailCode,
  storeEmailCode,
  verifyEmailCode,
} from '../lib/email-code'
import { signSession } from '../lib/session'
import { findOrCreateUserByEmail } from '../lib/users'

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/send-code', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}))
  const email = body.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return c.json({ error: 'invalid_email' }, 400)
  }

  const ok = await canSendEmailCode(c.env.KV, email)
  if (!ok) {
    return c.json({ error: 'too_frequent' }, 429)
  }

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
    console.error('[send-code]', e)
    return c.json(
      {
        error: 'email_send_failed',
        detail: e instanceof Error ? e.message : 'unknown',
        hint: '检查 RESEND_API_KEY / EMAIL_FROM，或域名是否已在 Resend 验证。',
      },
      502,
    )
  }
})

authRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({}))
  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()
  if (!email || !isValidEmail(email) || !code) {
    return c.json({ error: 'invalid_payload' }, 400)
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'server_misconfigured' }, 500)
  }

  const valid = await verifyEmailCode(c.env.KV, email, code)
  if (!valid) {
    return c.json({ error: 'invalid_code' }, 400)
  }

  const user = await findOrCreateUserByEmail(c.env.KV, email)
  const token = await signSession(c.env.JWT_SECRET, {
    sub: user.id,
    email: user.email,
  })

  return c.json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      memberTier: user.memberTier,
      memberStatus: user.memberStatus,
    },
  })
})
