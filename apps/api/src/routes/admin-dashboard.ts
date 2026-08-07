import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireAnyMenu, requireMenu, actorPerms } from '../lib/admin-perm'
import { listAudits } from '../lib/audit'
import { listAiUsage, summarizeAiUsage } from '../lib/ai-usage'
import { listDownloads } from '../lib/downloads'
import { listOrders } from '../lib/orders'
import { isUserMembershipActive, listUsers } from '../lib/users'
import {
  ensureSeedCatalog,
  listWallpapers,
} from '../lib/wallpaper-catalog'
import { filterOwned, getActorScope } from '../lib/admin-scope'

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

  const orders = await listOrders(c.env.KV)
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

  const today = new Date()
  const dayKeys: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    dayKeys.push(d.toISOString().slice(0, 10))
  }

  const trend = dayKeys.map((date) => {
    const dayPaid = paid.filter((o) => (o.paidAt || o.createdAt).slice(0, 10) === date)
    const dayRevenue = dayPaid.filter((o) => countsRevenue(orderType(o)))
    return {
      date,
      revenue: dayRevenue.reduce((sum, o) => sum + Number(o.totalFee || 0), 0).toFixed(2),
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

  return c.json({ summary, trend, byTier })
})

adminDashboardRoutes.get('/overview', async (c) => {
  const denied = await requireMenu(c, 'dashboard.overview')
  if (denied) return denied

  await ensureSeedCatalog(c.env.KV)
  const [users, orders, wallpapers, downloads, audits, aiUsage] = await Promise.all([
    listUsers(c.env.KV),
    listOrders(c.env.KV),
    listWallpapers(c.env.KV),
    listDownloads(c.env.KV, 1000),
    listAudits(c.env.KV, 8),
    listAiUsage(c.env.KV, 2000),
  ])

  const today = todayKey()
  const paidMembers = users.filter(
    (u) => isUserMembershipActive(u) && u.memberTier && u.memberTier !== 'free',
  )
  const ordersToday = orders.filter((o) => dayKey(o.createdAt) === today)
  const paidOrders = orders.filter((o) => o.status === 'paid')
  const revenue = paidOrders
    .filter((o) => (o.type ?? 'paid') === 'paid' || o.type === 'mock')
    .reduce((sum, o) => sum + Number(o.totalFee || 0), 0)
  const revenueToday = paidOrders
    .filter(
      (o) =>
        dayKey(o.paidAt || o.createdAt) === today &&
        ((o.type ?? 'paid') === 'paid' || o.type === 'mock'),
    )
    .reduce((sum, o) => sum + Number(o.totalFee || 0), 0)

  const downloadsToday = downloads.filter((d) => dayKey(d.createdAt) === today)
  const aiSummary = summarizeAiUsage(aiUsage, today)

  return c.json({
    overview: {
      usersTotal: users.length,
      usersDisabled: users.filter((u) => u.accountStatus === 'disabled').length,
      usersBlacklisted: users.filter((u) => u.blacklisted).length,
      paidMembers: paidMembers.length,
      ordersTotal: orders.length,
      ordersToday: ordersToday.length,
      ordersPaid: paidOrders.length,
      ordersPending: orders.filter((o) => o.status === 'pending').length,
      revenueTotal: revenue.toFixed(2),
      revenueToday: revenueToday.toFixed(2),
      wallpapersTotal: wallpapers.length,
      wallpapersPending: wallpapers.filter((w) => w.status === 'pending').length,
      wallpapersPublished: wallpapers.filter((w) => w.status === 'published').length,
      downloadsTotal: downloads.length,
      downloadsToday: downloadsToday.length,
      downloadsSuccessToday: downloadsToday.filter((d) => d.success).length,
      aiTotal: aiSummary.total,
      aiToday: aiSummary.todayTotal,
      aiSuccessToday: aiSummary.todaySuccess,
      aiFailedToday: aiSummary.todayFailed,
      aiAvgDurationMs: aiSummary.avgDurationMs,
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
}

adminDashboardRoutes.get('/notifications', async (c) => {
  const { role } = await actorPerms(c)
  const canWallpapers = Boolean(role?.menus.includes('wallpapers.list'))
  if (!canWallpapers) {
    return c.json({ badge: 0, items: [] as AdminNotificationItem[] })
  }

  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const wallpapers = filterOwned(await listWallpapers(c.env.KV), scope, admin.id)
  const pending = wallpapers.filter((w) => w.status === 'pending')
  const aiFailed = pending.filter((w) => (w.aiStatus ?? 'idle') === 'failed')
  const aiReady = pending.filter((w) => (w.aiStatus ?? 'idle') === 'ready')

  const items: AdminNotificationItem[] = []
  if (pending.length > 0) {
    items.push({
      id: 'wallpaper_pending',
      type: 'wallpaper_pending',
      title: `${pending.length} 张壁纸待审核`,
      description: '入库后需人工审核通过才会上架',
      count: pending.length,
      path: '/wallpapers?status=pending',
    })
  }
  if (aiFailed.length > 0) {
    const sample = aiFailed
      .slice(0, 3)
      .map((w) => w.title || w.id)
      .join('、')
    items.push({
      id: 'ai_failed',
      type: 'ai_failed',
      title: `${aiFailed.length} 张 AI 识别失败`,
      description: sample ? `例如：${sample}` : '请补传预览或重新识别',
      count: aiFailed.length,
      path: '/wallpapers?status=pending&aiStatus=failed',
    })
  }
  if (aiReady.length > 0) {
    const sample = aiReady
      .slice(0, 3)
      .map((w) => w.title || w.id)
      .join('、')
    items.push({
      id: 'ai_ready',
      type: 'ai_ready',
      title: `${aiReady.length} 张 AI 建议待确认`,
      description: sample ? `例如：${sample}` : '打开审核确认页采用描述与分类标签',
      count: aiReady.length,
      path: '/wallpapers?status=pending&aiStatus=ready',
    })
  }

  const badge = pending.length
  return c.json({ badge, items, counts: {
    pending: pending.length,
    aiFailed: aiFailed.length,
    aiReady: aiReady.length,
  } })
})
