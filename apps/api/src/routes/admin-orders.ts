import { Hono } from 'hono'
import { ORDER_STATUS, type MembershipTierId } from '@vault/shared'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireButton, requireMenu } from '../lib/admin-perm'
import { writeAudit } from '../lib/audit'
import { isMembershipTierId } from '../lib/catalog'
import { paginate, parsePageQuery } from '../lib/paging'
import { getOrder, listOrders, saveOrder } from '../lib/orders'
import { inDateRange, resolveDateRange } from '../lib/date-range'
import {
  activateMembership,
  getUser,
  isUserMembershipActive,
  revokeMembership,
} from '../lib/users'
import { writeUserLog } from '../lib/user-logs'

export const adminOrdersRoutes = new Hono<AppEnv>()
adminOrdersRoutes.use('*', requireAdmin)

function enrichType(o: { type?: string; totalFee: string }) {
  return o.type ?? (o.totalFee === '0.00' || o.totalFee === '0' ? 'free' : 'paid')
}

async function enrichOrder(kv: KVNamespace, o: Awaited<ReturnType<typeof getOrder>>) {
  if (!o) return null
  const user = await getUser(kv, o.userId)
  return {
    ...o,
    type: enrichType(o),
    userEmail: user?.email ?? null,
  }
}

function csvEscape(v: string | null | undefined) {
  const s = v ?? ''
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

adminOrdersRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'orders.list')
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const q = c.req.query('q')?.trim().toLowerCase()
  const status = c.req.query('status')?.trim()
  const type = c.req.query('type')?.trim()

  let orders = (await listOrders(c.env.KV)).filter((o) =>
    inDateRange(o.createdAt, range.from, range.to),
  )
  if (status && status !== 'all') {
    orders = orders.filter((o) => o.status === status)
  }
  if (type && type !== 'all') {
    orders = orders.filter((o) => enrichType(o) === type)
  }

  const enriched = await Promise.all(
    orders.map(async (o) => {
      const user = await getUser(c.env.KV, o.userId)
      return {
        id: o.id,
        userId: o.userId,
        userEmail: user?.email ?? null,
        tier: o.tier,
        totalFee: o.totalFee,
        status: o.status,
        type: enrichType(o),
        createdAt: o.createdAt,
        paidAt: o.paidAt ?? null,
        hasCallback: Boolean(o.callbackPayload),
        refundedAt: o.refundedAt ?? null,
        regrantedAt: o.regrantedAt ?? null,
      }
    }),
  )

  let filtered = enriched
  if (q) {
    filtered = enriched.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        (o.userEmail?.toLowerCase().includes(q) ?? false),
    )
  }

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(filtered, page, pageSize)
  return c.json({
    orders: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    range: { from: range.from, to: range.to, days: range.days },
  })
})

adminOrdersRoutes.get('/export', async (c) => {
  const denied = await requireButton(c, 'orders.list.export')
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const orders = (await listOrders(c.env.KV)).filter((o) =>
    inDateRange(o.createdAt, range.from, range.to),
  )
  const header = [
    'id',
    'userEmail',
    'userId',
    'type',
    'tier',
    'totalFee',
    'status',
    'createdAt',
    'paidAt',
    'refundedAt',
  ]
  const lines = [header.join(',')]
  for (const o of orders) {
    const user = await getUser(c.env.KV, o.userId)
    lines.push(
      [
        csvEscape(o.id),
        csvEscape(user?.email),
        csvEscape(o.userId),
        csvEscape(enrichType(o)),
        csvEscape(o.tier),
        csvEscape(o.totalFee),
        csvEscape(o.status),
        csvEscape(o.createdAt),
        csvEscape(o.paidAt),
        csvEscape(o.refundedAt),
      ].join(','),
    )
  }

  const admin = c.get('admin')!
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'orders.list.export',
    target: `orders:${orders.length}`,
  })

  const bom = '\uFEFF'
  return new Response(bom + lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})

adminOrdersRoutes.get('/:id', async (c) => {
  const denied = await requireMenu(c, 'orders.list')
  if (denied) return denied
  const order = await getOrder(c.env.KV, c.req.param('id'))
  if (!order) return c.json({ error: 'not_found' }, 404)
  const user = await getUser(c.env.KV, order.userId)
  return c.json({
    order: await enrichOrder(c.env.KV, order),
    user: user
      ? {
          id: user.id,
          email: user.email,
          memberTier: user.memberTier,
          memberStatus: user.memberStatus,
          memberExpiresAt: user.memberExpiresAt,
          accountStatus: user.accountStatus ?? 'active',
          membershipActive: isUserMembershipActive(user),
        }
      : null,
  })
})

/** Replay fulfillment: grant membership for this order's tier. */
adminOrdersRoutes.post('/:id/regrant', async (c) => {
  const denied = await requireButton(c, 'orders.list.regrant')
  if (denied) return denied
  const order = await getOrder(c.env.KV, c.req.param('id'))
  if (!order) return c.json({ error: 'not_found' }, 404)
  if (order.status !== ORDER_STATUS.paid) {
    return c.json({ error: 'order_not_paid' }, 400)
  }
  if (!isMembershipTierId(order.tier)) {
    return c.json({ error: 'invalid_tier' }, 400)
  }

  const user = await activateMembership(
    c.env.KV,
    order.userId,
    order.tier as MembershipTierId,
  )
  if (!user) return c.json({ error: 'user_not_found' }, 404)

  order.regrantedAt = new Date().toISOString()
  await saveOrder(c.env.KV, order)

  const admin = c.get('admin')!
  await writeUserLog(c.env.KV, {
    userId: order.userId,
    action: 'order.regrant',
    detail: `order=${order.id};tier=${order.tier}`,
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'orders.list.regrant',
    target: `order:${order.id}`,
    detail: order.tier,
  })

  return c.json({
    ok: true,
    order: await enrichOrder(c.env.KV, order),
    user: {
      id: user.id,
      email: user.email,
      memberTier: user.memberTier,
      memberExpiresAt: user.memberExpiresAt,
      membershipActive: isUserMembershipActive(user),
    },
  })
})

adminOrdersRoutes.post('/:id/refund', async (c) => {
  const denied = await requireButton(c, 'orders.list.refund')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    note?: string
    revokeMembership?: boolean
  }
  const order = await getOrder(c.env.KV, c.req.param('id'))
  if (!order) return c.json({ error: 'not_found' }, 404)
  if (order.status === ORDER_STATUS.refunded) {
    return c.json({ error: 'already_refunded' }, 400)
  }
  if (order.status !== ORDER_STATUS.paid) {
    return c.json({ error: 'order_not_paid' }, 400)
  }

  order.status = ORDER_STATUS.refunded
  order.refundedAt = new Date().toISOString()
  order.refundNote = body.note?.trim() || undefined
  await saveOrder(c.env.KV, order)

  let user = await getUser(c.env.KV, order.userId)
  if (body.revokeMembership) {
    user = await revokeMembership(c.env.KV, order.userId)
  }

  const admin = c.get('admin')!
  await writeUserLog(c.env.KV, {
    userId: order.userId,
    action: 'order.refund',
    detail: `order=${order.id};revoke=${Boolean(body.revokeMembership)};note=${order.refundNote || ''}`,
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'orders.list.refund',
    target: `order:${order.id}`,
    detail: JSON.stringify({
      revokeMembership: Boolean(body.revokeMembership),
      note: order.refundNote,
    }),
  })

  return c.json({
    ok: true,
    order: await enrichOrder(c.env.KV, order),
    user: user
      ? {
          id: user.id,
          email: user.email,
          memberTier: user.memberTier,
          memberExpiresAt: user.memberExpiresAt,
          membershipActive: isUserMembershipActive(user),
        }
      : null,
  })
})
