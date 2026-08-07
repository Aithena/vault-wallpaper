import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { getOrder, listOrders } from '../lib/orders'
import { getUser, isUserMembershipActive } from '../lib/users'

export const adminOrdersRoutes = new Hono<AppEnv>()
adminOrdersRoutes.use('*', requireAdmin)

function enrichType(o: { type?: string; totalFee: string }) {
  return o.type ?? (o.totalFee === '0.00' || o.totalFee === '0' ? 'free' : 'paid')
}

adminOrdersRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'orders.list')
  if (denied) return denied
  const orders = await listOrders(c.env.KV)
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
      }
    }),
  )
  return c.json({ orders: enriched })
})

adminOrdersRoutes.get('/:id', async (c) => {
  const denied = await requireMenu(c, 'orders.list')
  if (denied) return denied
  const order = await getOrder(c.env.KV, c.req.param('id'))
  if (!order) return c.json({ error: 'not_found' }, 404)
  const user = await getUser(c.env.KV, order.userId)
  return c.json({
    order: {
      ...order,
      type: enrichType(order),
      userEmail: user?.email ?? null,
    },
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
