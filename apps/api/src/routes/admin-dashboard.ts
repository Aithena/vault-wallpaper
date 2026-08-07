import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireMenu } from '../lib/admin-perm'
import { listAudits } from '../lib/audit'
import { listDownloads } from '../lib/downloads'
import { listOrders } from '../lib/orders'
import { isUserMembershipActive, listUsers } from '../lib/users'
import {
  ensureSeedCatalog,
  listWallpapers,
} from '../lib/wallpaper-catalog'

export const adminDashboardRoutes = new Hono<AppEnv>()
adminDashboardRoutes.use('*', requireAdmin)

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

adminDashboardRoutes.get('/overview', async (c) => {
  const denied = await requireMenu(c, 'dashboard.overview')
  if (denied) return denied

  await ensureSeedCatalog(c.env.KV)
  const [users, orders, wallpapers, downloads, audits] = await Promise.all([
    listUsers(c.env.KV),
    listOrders(c.env.KV),
    listWallpapers(c.env.KV),
    listDownloads(c.env.KV, 1000),
    listAudits(c.env.KV, 8),
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
