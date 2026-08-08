/** Incremental dashboard counters — avoids full-table scans on overview. */

export type DashboardStats = {
  usersTotal: number
  usersDisabled: number
  usersBlacklisted: number
  /** Best-effort; adjusted on membership activate/revoke/admin patch. */
  paidMembers: number
  ordersTotal: number
  ordersPaid: number
  ordersPending: number
  revenueTotal: number
  wallpapersTotal: number
  wallpapersPending: number
  wallpapersPublished: number
  downloadsTotal: number
  aiTotal: number
  aiSuccessCount: number
  aiDurationSumMs: number
  /** UTC yyyy-mm-dd for today_* buckets */
  day: string
  ordersToday: number
  revenueToday: number
  downloadsToday: number
  downloadsSuccessToday: number
  aiToday: number
  aiSuccessToday: number
  aiFailedToday: number
}

const KEY = 'stats:dashboard_v1'
const BUILT_FLAG = 'stats:dashboard_built_v1'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function emptyStats(day = todayKey()): DashboardStats {
  return {
    usersTotal: 0,
    usersDisabled: 0,
    usersBlacklisted: 0,
    paidMembers: 0,
    ordersTotal: 0,
    ordersPaid: 0,
    ordersPending: 0,
    revenueTotal: 0,
    wallpapersTotal: 0,
    wallpapersPending: 0,
    wallpapersPublished: 0,
    downloadsTotal: 0,
    aiTotal: 0,
    aiSuccessCount: 0,
    aiDurationSumMs: 0,
    day,
    ordersToday: 0,
    revenueToday: 0,
    downloadsToday: 0,
    downloadsSuccessToday: 0,
    aiToday: 0,
    aiSuccessToday: 0,
    aiFailedToday: 0,
  }
}

function rollDay(stats: DashboardStats): DashboardStats {
  const day = todayKey()
  if (stats.day === day) return stats
  return {
    ...stats,
    day,
    ordersToday: 0,
    revenueToday: 0,
    downloadsToday: 0,
    downloadsSuccessToday: 0,
    aiToday: 0,
    aiSuccessToday: 0,
    aiFailedToday: 0,
  }
}

async function putStats(kv: KVNamespace, stats: DashboardStats) {
  await kv.put(KEY, JSON.stringify(rollDay(stats)))
}

/** One-time rebuild from current indexes so overview isn't all zeros after deploy. */
export async function ensureDashboardStats(
  kv: KVNamespace,
): Promise<DashboardStats> {
  const built = await kv.get(BUILT_FLAG)
  if (built) return getDashboardStats(kv)

  const [{ listUsers, isUserMembershipActive }, { listOrders }, { listWallpapers }, { listDownloads }, { listAiUsage }] =
    await Promise.all([
      import('./users'),
      import('./orders'),
      import('./wallpaper-catalog'),
      import('./downloads'),
      import('./ai-usage'),
    ])

  const day = todayKey()
  const [users, orders, wallpapers, downloads, aiUsage] = await Promise.all([
    listUsers(kv),
    listOrders(kv),
    listWallpapers(kv),
    listDownloads(kv, 1000),
    listAiUsage(kv, 2000),
  ])

  const stats = emptyStats(day)
  stats.usersTotal = users.length
  stats.usersDisabled = users.filter((u) => u.accountStatus === 'disabled').length
  stats.usersBlacklisted = users.filter((u) => u.blacklisted).length
  stats.paidMembers = users.filter(
    (u) =>
      isUserMembershipActive(u) && u.memberTier && u.memberTier !== 'free',
  ).length

  stats.ordersTotal = orders.length
  stats.ordersPaid = orders.filter((o) => o.status === 'paid').length
  stats.ordersPending = orders.filter((o) => o.status === 'pending').length
  stats.ordersToday = orders.filter((o) => o.createdAt.slice(0, 10) === day).length
  for (const o of orders) {
    if (o.status !== 'paid') continue
    if (!orderCountsRevenue(o.type, o.totalFee)) continue
    const fee = Number(o.totalFee || 0)
    stats.revenueTotal += fee
    if ((o.paidAt || o.createdAt).slice(0, 10) === day) stats.revenueToday += fee
  }

  stats.wallpapersTotal = wallpapers.length
  stats.wallpapersPending = wallpapers.filter((w) => w.status === 'pending').length
  stats.wallpapersPublished = wallpapers.filter(
    (w) => w.status === 'published',
  ).length

  stats.downloadsTotal = downloads.length
  const dlToday = downloads.filter((d) => d.createdAt.slice(0, 10) === day)
  stats.downloadsToday = dlToday.length
  stats.downloadsSuccessToday = dlToday.filter((d) => d.success).length

  stats.aiTotal = aiUsage.length
  const aiOk = aiUsage.filter((r) => r.status === 'success')
  stats.aiSuccessCount = aiOk.length
  stats.aiDurationSumMs = aiOk.reduce((s, r) => s + r.durationMs, 0)
  const aiToday = aiUsage.filter((r) => r.createdAt.slice(0, 10) === day)
  stats.aiToday = aiToday.length
  stats.aiSuccessToday = aiToday.filter((r) => r.status === 'success').length
  stats.aiFailedToday = aiToday.filter((r) => r.status === 'failed').length

  await putStats(kv, stats)
  await kv.put(BUILT_FLAG, '1')
  return stats
}

export async function getDashboardStats(
  kv: KVNamespace,
): Promise<DashboardStats> {
  const raw = await kv.get(KEY)
  if (!raw) return emptyStats()
  try {
    return rollDay(JSON.parse(raw) as DashboardStats)
  } catch {
    return emptyStats()
  }
}

export async function patchDashboardStats(
  kv: KVNamespace,
  patch: (stats: DashboardStats) => void,
): Promise<DashboardStats> {
  const built = await kv.get(BUILT_FLAG)
  if (!built) await ensureDashboardStats(kv)
  const stats = await getDashboardStats(kv)
  patch(stats)
  await putStats(kv, stats)
  return stats
}

export function orderCountsRevenue(type?: string, totalFee?: string) {
  const t =
    type ??
    (totalFee === '0.00' || totalFee === '0' ? 'free' : 'paid')
  return t === 'paid' || t === 'mock'
}
