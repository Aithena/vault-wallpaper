import { Hono } from 'hono'
import { MEMBERSHIP_TIERS, ORDER_STATUS } from '@vault/shared'
import type { AppEnv } from '../types'
import {
  isMembershipTierId,
} from '../lib/catalog'
import { resolveConfiguredTierPrice, getTierConfigs } from '../lib/tiers-config'
import { getSiteConfig } from '../lib/site-config'
import { readBearer, verifySession } from '../lib/session'
import { activateMembership, getUser } from '../lib/users'
import { generateOrderId } from '../lib/order-id'
import { xunhuHash } from '../lib/xunhupay'
import type { OrderRecord } from '../lib/orders'

export const payRoutes = new Hono<AppEnv>()

/** Create order. With Xunhupay secrets → redirect URL; otherwise mock-pay for local experiment. */
payRoutes.post('/create', async (c) => {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const payer = await getUser(c.env.KV, session.sub)
  if (!payer || payer.accountStatus === 'disabled') {
    return c.json({ error: 'unauthorized' }, 401)
  }
  if (payer.blacklisted) {
    return c.json({ error: 'blacklisted' }, 403)
  }

  const body = await c.req.json<{ tier?: string }>().catch(() => ({}))
  const tier = body.tier
  if (!tier || !isMembershipTierId(tier)) {
    return c.json({ error: 'invalid_tier' }, 400)
  }

  const site = await getSiteConfig(c.env.KV)
  if (!site.purchaseEnabled && tier !== 'free') {
    return c.json({ error: 'purchase_disabled' }, 403)
  }

  const tiers = await getTierConfigs(c.env.KV)
  const tierCfg = tiers.find((t) => t.id === tier)
  if (tierCfg && tierCfg.onSale === false) {
    return c.json({ error: 'tier_not_on_sale' }, 403)
  }

  const orderId = generateOrderId()
  const totalFee = await resolveConfiguredTierPrice(c.env.KV, tier)
  const order: OrderRecord = {
    id: orderId,
    userId: session.sub,
    tier,
    totalFee,
    status: ORDER_STATUS.pending,
    type: 'paid',
    createdAt: new Date().toISOString(),
  }
  await c.env.KV.put(`order:${orderId}`, JSON.stringify(order), {
    expirationTtl: 60 * 60 * 24 * 7,
  })

  // Free tier: activate immediately, no payment
  if (tier === 'free' || totalFee === '0.00' || totalFee === '0') {
    order.status = ORDER_STATUS.paid
    order.type = 'free'
    order.paidAt = new Date().toISOString()
    await c.env.KV.put(`order:${orderId}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 7,
    })
    const user = await activateMembership(c.env.KV, session.sub, tier)
    return c.json({
      ok: true,
      mode: 'free',
      orderId,
      totalFee,
      tier,
      user,
      message: '免费档已开通',
    })
  }

  const appid = c.env.XUNHUPAY_APPID
  const secret = c.env.XUNHUPAY_APPSECRET
  const gateway = c.env.XUNHUPAY_GATEWAY || 'https://api.xunhupay.com'

  if (!appid || !secret) {
    order.type = 'mock'
    await c.env.KV.put(`order:${orderId}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 7,
    })
    return c.json({
      ok: true,
      mode: 'mock',
      orderId,
      totalFee,
      tier,
      mockPayUrl: `/api/pay/mock-complete?orderId=${orderId}`,
      message: '未配置虎皮椒密钥，使用本地模拟支付',
    })
  }

  const notifyUrl = new URL('/api/pay/notify', c.req.url).toString()
  const returnUrl = `${c.env.PUBLIC_ORIGIN}/pay/result?orderId=${orderId}`
  const time = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID().replace(/-/g, '')

  const params: Record<string, string | number> = {
    version: '1.1',
    appid,
    trade_order_id: orderId,
    total_fee: totalFee,
    title: `${tierCfg?.label || MEMBERSHIP_TIERS[tier].label}会员（一年）`,
    time,
    notify_url: notifyUrl,
    return_url: returnUrl,
    nonce_str: nonce,
  }
  params.hash = await xunhuHash(params, secret)

  return c.json({
    ok: true,
    mode: 'xunhupay',
    orderId,
    totalFee,
    tier,
    gateway: `${gateway}/payment/do.html`,
    params,
  })
})

/** Local experiment: mark order paid + activate membership without 虎皮椒. */
payRoutes.post('/mock-complete', async (c) => {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ orderId?: string }>().catch(() => ({}))
  const orderId = body.orderId
  if (!orderId) return c.json({ error: 'missing_order' }, 400)

  const raw = await c.env.KV.get(`order:${orderId}`)
  if (!raw) return c.json({ error: 'order_not_found' }, 404)
  const order = JSON.parse(raw) as OrderRecord
  if (order.userId !== session.sub) {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (order.status === ORDER_STATUS.paid) {
    return c.json({ ok: true, alreadyPaid: true, order })
  }

  if (!isMembershipTierId(order.tier)) {
    return c.json({ error: 'invalid_tier' }, 400)
  }

  order.status = ORDER_STATUS.paid
  order.paidAt = new Date().toISOString()
  await c.env.KV.put(`order:${orderId}`, JSON.stringify(order))
  const user = await activateMembership(c.env.KV, order.userId, order.tier)

  return c.json({ ok: true, order, user })
})

payRoutes.get('/order/:id', async (c) => {
  const token = readBearer(c.req.header('Authorization'))
  if (!token || !c.env.JWT_SECRET) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const session = await verifySession(c.env.JWT_SECRET, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const raw = await c.env.KV.get(`order:${c.req.param('id')}`)
  if (!raw) return c.json({ error: 'order_not_found' }, 404)
  const order = JSON.parse(raw) as OrderRecord
  if (order.userId !== session.sub) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return c.json({ order })
})

/** 虎皮椒异步回调：验签后开通会员，返回 success */
payRoutes.post('/notify', async (c) => {
  const secret = c.env.XUNHUPAY_APPSECRET
  if (!secret) return c.text('fail', 500)

  const form = await c.req.parseBody()
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === 'string') params[k] = v
  }

  const hash = params.hash
  const expected = await xunhuHash(params, secret)
  if (!hash || hash !== expected) {
    return c.text('fail', 400)
  }

  const orderId = params.trade_order_id
  const status = params.status
  if (!orderId) return c.text('fail', 400)

  const raw = await c.env.KV.get(`order:${orderId}`)
  if (!raw) return c.text('success') // idempotent ack

  const order = JSON.parse(raw) as OrderRecord
  if (order.status === ORDER_STATUS.paid) return c.text('success')

  // 虎皮椒：OD = 已支付
  if (status === 'OD' || status === 'paid') {
    if (!isMembershipTierId(order.tier)) return c.text('fail', 400)
    order.status = ORDER_STATUS.paid
    order.paidAt = new Date().toISOString()
    order.callbackAt = new Date().toISOString()
    order.callbackPayload = params
    await c.env.KV.put(`order:${orderId}`, JSON.stringify(order))
    await activateMembership(c.env.KV, order.userId, order.tier)
  } else {
    // Keep last notify for debugging even if not paid yet
    order.callbackAt = new Date().toISOString()
    order.callbackPayload = params
    await c.env.KV.put(`order:${orderId}`, JSON.stringify(order))
  }

  return c.text('success')
})
