import { Hono } from 'hono'
import type { MembershipTierId, MemberStatus } from '@vault/shared'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireButton, requireMenu } from '../lib/admin-perm'
import { writeAudit } from '../lib/audit'
import { listOrdersByUser } from '../lib/orders'
import { addToBlacklist, removeFromBlacklist } from '../lib/blacklist'
import { listUserLogs, writeUserLog } from '../lib/user-logs'
import { paginate, parsePageQuery } from '../lib/paging'
import {
  activateMembership,
  getUser,
  isUserMembershipActive,
  listUsers,
  updateUserAdmin,
} from '../lib/users'

export const adminUsersRoutes = new Hono<AppEnv>()
adminUsersRoutes.use('*', requireAdmin)

function publicUser(u: NonNullable<Awaited<ReturnType<typeof getUser>>>) {
  return {
    id: u.id,
    email: u.email,
    memberTier: u.memberTier,
    memberStatus: u.memberStatus,
    memberExpiresAt: u.memberExpiresAt,
    memberSince: u.memberSince,
    createdAt: u.createdAt,
    accountStatus: u.accountStatus ?? 'active',
    blacklisted: Boolean(u.blacklisted),
    membershipActive: isUserMembershipActive(u),
  }
}

adminUsersRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'users.list')
  if (denied) return denied
  const q = c.req.query('q')?.trim().toLowerCase()
  const blacklisted = c.req.query('blacklisted')
  const memberType = c.req.query('memberType')
  const dateFrom = c.req.query('dateFrom')?.trim()
  const dateTo = c.req.query('dateTo')?.trim()

  let users = await listUsers(c.env.KV)
  if (q) {
    users = users.filter((u) => u.email.toLowerCase().includes(q))
  }
  if (blacklisted === 'yes') {
    users = users.filter((u) => u.blacklisted)
  } else if (blacklisted === 'no') {
    users = users.filter((u) => !u.blacklisted)
  }
  if (memberType === 'paid') {
    users = users.filter(
      (u) => isUserMembershipActive(u) && u.memberTier && u.memberTier !== 'free',
    )
  } else if (memberType === 'free') {
    users = users.filter(
      (u) => !isUserMembershipActive(u) || !u.memberTier || u.memberTier === 'free',
    )
  }
  if (dateFrom) {
    users = users.filter((u) => u.createdAt.slice(0, 10) >= dateFrom)
  }
  if (dateTo) {
    users = users.filter((u) => u.createdAt.slice(0, 10) <= dateTo)
  }

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(users.map(publicUser), page, pageSize)
  return c.json({
    users: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})

adminUsersRoutes.get('/:id', async (c) => {
  const denied = await requireMenu(c, 'users.list')
  if (denied) return denied
  const user = await getUser(c.env.KV, c.req.param('id'))
  if (!user) return c.json({ error: 'not_found' }, 404)
  const orders = await listOrdersByUser(c.env.KV, user.id, 20)
  return c.json({
    user: publicUser(user),
    orders,
  })
})

adminUsersRoutes.get('/:id/logs', async (c) => {
  const denied = await requireButton(c, 'users.list.logs')
  if (denied) return denied
  const id = c.req.param('id')
  const user = await getUser(c.env.KV, id)
  if (!user) return c.json({ error: 'not_found' }, 404)
  const { page, pageSize } = parsePageQuery(c.req.query(), { pageSize: 50 })
  const logs = await listUserLogs(c.env.KV, id, 200)
  const paged = paginate(logs, page, pageSize)
  return c.json({
    user: publicUser(user),
    logs: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})

adminUsersRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    accountStatus?: 'active' | 'disabled'
    blacklisted?: boolean
    memberTier?: MembershipTierId | null
    memberStatus?: MemberStatus | null
    memberExpiresAt?: string | null
    blacklistReason?: string
  }

  if (body.accountStatus !== undefined) {
    const denied = await requireButton(c, 'users.list.disable')
    if (denied) return denied
  } else if (body.blacklisted !== undefined) {
    const denied = await requireButton(
      c,
      body.blacklisted ? 'users.blacklist.create' : 'users.blacklist.remove',
    )
    if (denied) return denied
  } else {
    const denied = await requireButton(c, 'users.list.edit')
    if (denied) return denied
  }

  const before = await getUser(c.env.KV, id)
  if (!before) return c.json({ error: 'not_found' }, 404)
  const admin = c.get('admin')!

  if (body.blacklisted === true) {
    const result = await addToBlacklist(c.env.KV, {
      email: before.email,
      reason: body.blacklistReason,
      operatorId: admin.id,
      operator: admin.username,
    })
    if (!result.ok) return c.json({ error: result.error }, 400)
    await writeUserLog(c.env.KV, {
      userId: id,
      action: 'user.blacklist',
      detail: result.entry.reason,
      actorType: 'admin',
      actorId: admin.id,
      actorName: admin.username,
    })
    await writeAudit(c.env.KV, {
      adminId: admin.id,
      adminUsername: admin.username,
      action: 'users.blacklist.create',
      target: `user:${id}`,
      detail: result.entry.reason,
    })
    return c.json({ ok: true, user: publicUser(result.user) })
  }

  if (body.blacklisted === false) {
    const result = await removeFromBlacklist(c.env.KV, id)
    if (!result.ok) return c.json({ error: result.error }, 404)
    await writeUserLog(c.env.KV, {
      userId: id,
      action: 'user.unblacklist',
      actorType: 'admin',
      actorId: admin.id,
      actorName: admin.username,
    })
    await writeAudit(c.env.KV, {
      adminId: admin.id,
      adminUsername: admin.username,
      action: 'users.blacklist.remove',
      target: `user:${id}`,
    })
    return c.json({ ok: true, user: publicUser(result.user) })
  }

  const user = await updateUserAdmin(c.env.KV, id, body)
  if (!user) return c.json({ error: 'not_found' }, 404)

  const isDisable = body.accountStatus !== undefined
  const action = isDisable
    ? body.accountStatus === 'disabled'
      ? 'user.disable'
      : 'user.enable'
    : 'user.edit'

  await writeUserLog(c.env.KV, {
    userId: id,
    action,
    detail: JSON.stringify(body),
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: isDisable ? 'users.list.disable' : 'users.list.edit',
    target: `user:${id}`,
    detail: JSON.stringify(body),
  })

  return c.json({ ok: true, user: publicUser(user) })
})

adminUsersRoutes.post('/:id/renew', async (c) => {
  const denied = await requireButton(c, 'users.list.renew')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as { tier?: MembershipTierId }
  if (!body.tier) return c.json({ error: 'invalid_payload' }, 400)
  const user = await activateMembership(c.env.KV, c.req.param('id'), body.tier)
  if (!user) return c.json({ error: 'not_found' }, 404)

  const orderId = `admin_${crypto.randomUUID().slice(0, 8)}`
  const order = {
    id: orderId,
    userId: user.id,
    tier: body.tier,
    totalFee: '0.00',
    status: 'paid',
    type: 'admin_grant',
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  }
  await c.env.KV.put(`order:${orderId}`, JSON.stringify(order))

  const admin = c.get('admin')!
  await writeUserLog(c.env.KV, {
    userId: user.id,
    action: 'user.renew',
    detail: `tier=${body.tier};order=${orderId};expires=${user.memberExpiresAt}`,
    actorType: 'admin',
    actorId: admin.id,
    actorName: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'users.list.renew',
    target: `user:${user.id}`,
    detail: body.tier,
  })
  return c.json({ ok: true, user: publicUser(user), order })
})
