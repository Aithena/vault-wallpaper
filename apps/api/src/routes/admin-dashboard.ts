import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireAnyMenu, requireMenu, actorPerms } from '../lib/admin-perm'
import { listAudits } from '../lib/audit'
import { getVisitorDayStats } from '../lib/visitors'
import { listOrders } from '../lib/orders'
import {
  buildDayKeys,
  inDateRange,
  resolveDateRange,
} from '../lib/date-range'
import { getActorScope, assertOwned } from '../lib/admin-scope'
import {
  countUnreadTodos,
  listTodos,
  markTodoRead,
  type AdminTodoRecord,
} from '../lib/admin-todos'

export const adminDashboardRoutes = new Hono<AppEnv>()
adminDashboardRoutes.use('*', requireAdmin)

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function orderType(o: { type?: string; totalFee: string }) {
  return o.type ?? (o.totalFee === '0.00' || o.totalFee === '0' ? 'free' : 'paid')
}

function countsRevenue(type: string) {
  return type === 'paid' || type === 'mock'
}

adminDashboardRoutes.get('/finance', async (c) => {
  const denied = await requireAnyMenu(c, ['orders.finance', 'dashboard.overview'])
  if (denied) return denied

  const range = resolveDateRange({
    days: c.req.query('days'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  })
  if (!range.ok) return c.json({ error: range.error }, 400)

  const orders = (await listOrders(c.env.KV)).filter((o) =>
    inDateRange(o.paidAt || o.createdAt, range.from, range.to),
  )
  const paid = orders.filter((o) => o.status === 'paid')

  const summary = {
    paidCount: paid.length,
    revenue: paid
      .filter((o) => countsRevenue(orderType(o)))
      .reduce((sum, o) => sum + Number(o.totalFee || 0), 0)
      .toFixed(2),
    freeCount: paid.filter((o) => orderType(o) === 'free').length,
    adminGrantCount: paid.filter((o) => orderType(o) === 'admin_grant').length,
  }

  const dayKeys = buildDayKeys(range.from, range.to)
  const trend = dayKeys.map((date) => {
    const dayPaid = paid.filter(
      (o) => (o.paidAt || o.createdAt).slice(0, 10) === date,
    )
    const dayRevenue = dayPaid.filter((o) => countsRevenue(orderType(o)))
    return {
      date,
      revenue: dayRevenue
        .reduce((sum, o) => sum + Number(o.totalFee || 0), 0)
        .toFixed(2),
      paidCount: dayPaid.length,
    }
  })

  const tierMap = new Map<string, { count: number; revenue: number }>()
  for (const o of paid) {
    const tier = o.tier || 'unknown'
    const entry = tierMap.get(tier) ?? { count: 0, revenue: 0 }
    entry.count += 1
    if (countsRevenue(orderType(o))) {
      entry.revenue += Number(o.totalFee || 0)
    }
    tierMap.set(tier, entry)
  }
  const byTier = [...tierMap.entries()]
    .map(([tier, v]) => ({
      tier,
      count: v.count,
      revenue: v.revenue.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count)

  return c.json({
    summary,
    trend,
    byTier,
    range: { from: range.from, to: range.to, days: range.days },
  })
})

adminDashboardRoutes.get('/overview', async (c) => {
  const denied = await requireMenu(c, 'dashboard.overview')
  if (denied) return denied

  const { ensureDashboardStats } = await import('../lib/dashboard-stats')
  const [stats, audits, visitorTrend] = await Promise.all([
    ensureDashboardStats(c.env.KV),
    listAudits(c.env.KV, 8),
    getVisitorDayStats(c.env.KV, 1),
  ])

  const today = todayKey()
  const visitorToday = visitorTrend.find((d) => d.date === today) || {
    uv: 0,
    pv: 0,
  }

  const avgDurationMs =
    stats.aiSuccessCount > 0
      ? Math.round(stats.aiDurationSumMs / stats.aiSuccessCount)
      : 0

  return c.json({
    overview: {
      usersTotal: stats.usersTotal,
      usersDisabled: stats.usersDisabled,
      usersBlacklisted: stats.usersBlacklisted,
      paidMembers: stats.paidMembers,
      ordersTotal: stats.ordersTotal,
      ordersToday: stats.ordersToday,
      ordersPaid: stats.ordersPaid,
      ordersPending: stats.ordersPending,
      revenueTotal: stats.revenueTotal.toFixed(2),
      revenueToday: stats.revenueToday.toFixed(2),
      wallpapersTotal: stats.wallpapersTotal,
      wallpapersPending: stats.wallpapersPending,
      wallpapersPublished: stats.wallpapersPublished,
      downloadsTotal: stats.downloadsTotal,
      downloadsToday: stats.downloadsToday,
      downloadsSuccessToday: stats.downloadsSuccessToday,
      aiTotal: stats.aiTotal,
      aiToday: stats.aiToday,
      aiSuccessToday: stats.aiSuccessToday,
      aiFailedToday: stats.aiFailedToday,
      aiAvgDurationMs: avgDurationMs,
      visitorsUvToday: visitorToday.uv,
      visitorsPvToday: visitorToday.pv,
    },
    recentAudits: audits.map((a) => ({
      id: a.id,
      at: a.at,
      adminUsername: a.adminUsername,
      action: a.action,
      target: a.target,
    })),
  })
})

export type AdminNotificationItem = {
  id: string
  type: 'wallpaper_pending' | 'ai_failed' | 'ai_ready'
  title: string
  description: string
  count: number
  path: string
  wallpaperId?: string
  createdAt?: string
  readAt?: string | null
}

function todoToItem(t: AdminTodoRecord): AdminNotificationItem {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    description: t.description,
    count: 1,
    path: t.path,
    wallpaperId: t.wallpaperId,
    createdAt: t.createdAt,
    readAt: t.readAt ?? null,
  }
}

function filterScopedTodos(
  todos: AdminTodoRecord[],
  scope: 'all' | 'self',
  adminId: string,
) {
  return todos.filter((t) => {
    if (t.resolvedAt) return false
    if (scope === 'self' && t.createdByAdminId && t.createdByAdminId !== adminId) {
      return false
    }
    return true
  })
}

/**
 * Notifications are event-driven (todos written on wallpaper/AI paths).
 * - mode=badge (default for poll): unread counts only, no wallpaper list / reconcile
 * - mode=full: return unread items for the bell panel
 */
adminDashboardRoutes.get('/notifications', async (c) => {
  const { role } = await actorPerms(c)
  const canWallpapers = Boolean(role?.menus.includes('wallpapers.list'))
  if (!canWallpapers) {
    return c.json({ badge: 0, unread: 0, items: [] as AdminNotificationItem[] })
  }

  const mode = (c.req.query('mode') || 'badge').toLowerCase()
  const { admin, scope } = await getActorScope(c)

  if (mode !== 'full') {
    const { unread, pendingType } = await countUnreadTodos(c.env.KV, {
      limit: 500,
      scope,
      adminId: admin.id,
    })
    return c.json({
      badge: pendingType,
      unread,
      items: [] as AdminNotificationItem[],
      counts: {
        pending: pendingType,
      },
    })
  }

  const todos = filterScopedTodos(
    await listTodos(c.env.KV, 500),
    scope,
    admin.id,
  )
  const unreadTodos = todos.filter((t) => !t.readAt)
  const items = unreadTodos.slice(0, 50).map(todoToItem)
  const pendingType = todos.filter((t) => t.type === 'wallpaper_pending').length

  return c.json({
    badge: pendingType,
    unread: unreadTodos.length,
    items,
    counts: {
      pending: pendingType,
    },
  })
})

adminDashboardRoutes.post('/notifications/:id/read', async (c) => {
  const { role } = await actorPerms(c)
  const canWallpapers = Boolean(role?.menus.includes('wallpapers.list'))
  if (!canWallpapers) return c.json({ error: 'forbidden' }, 403)

  const { admin, scope } = await getActorScope(c)
  const todo = await markTodoRead(c.env.KV, c.req.param('id'))
  if (!todo) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, todo.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  return c.json({ ok: true, item: todoToItem(todo) })
})

adminDashboardRoutes.post('/notifications/read-all', async (c) => {
  const { role } = await actorPerms(c)
  const canWallpapers = Boolean(role?.menus.includes('wallpapers.list'))
  if (!canWallpapers) return c.json({ error: 'forbidden' }, 403)

  const { admin, scope } = await getActorScope(c)
  const todos = filterScopedTodos(await listTodos(c.env.KV, 500), scope, admin.id)
  let n = 0
  for (const t of todos) {
    if (t.readAt) continue
    await markTodoRead(c.env.KV, t.id)
    n += 1
  }
  return c.json({ ok: true, count: n })
})
