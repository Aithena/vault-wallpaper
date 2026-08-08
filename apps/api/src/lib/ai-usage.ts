export type AiUsageTrigger = 'auto' | 'manual'
export type AiUsageStatus = 'success' | 'failed' | 'skipped'

export type AiUsageRecord = {
  id: string
  createdAt: string
  wallpaperId: string
  wallpaperTitle: string
  model: string
  trigger: AiUsageTrigger
  status: AiUsageStatus
  /** preview | original | none */
  imageSource: string
  durationMs: number
  error?: string
  adminId?: string
  adminUsername?: string
}

const RECENT_KEY = 'ai_usage:recent_v1'
const MAX_RECENT = 2000
const LEGACY_INDEX_KEY = 'ai_usage:index'

function usageKey(id: string) {
  return `ai_usage:${id}`
}

async function readRecent(kv: KVNamespace): Promise<AiUsageRecord[] | null> {
  const raw = await kv.get(RECENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AiUsageRecord[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function migrateFromLegacy(kv: KVNamespace): Promise<AiUsageRecord[]> {
  const raw = await kv.get(LEGACY_INDEX_KEY)
  if (!raw) return []
  let ids: string[] = []
  try {
    ids = JSON.parse(raw) as string[]
    if (!Array.isArray(ids)) ids = []
  } catch {
    return []
  }
  const rows = (
    await Promise.all(
      ids.slice(0, MAX_RECENT).map(async (id) => {
        const r = await kv.get(usageKey(id))
        return r ? (JSON.parse(r) as AiUsageRecord) : null
      }),
    )
  ).filter((r): r is AiUsageRecord => Boolean(r))
  if (rows.length) {
    await kv.put(RECENT_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)))
  }
  return rows
}

export async function writeAiUsage(
  kv: KVNamespace,
  input: Omit<AiUsageRecord, 'id' | 'createdAt'> & { createdAt?: string },
): Promise<AiUsageRecord> {
  const record: AiUsageRecord = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt || new Date().toISOString(),
    wallpaperId: input.wallpaperId,
    wallpaperTitle: input.wallpaperTitle,
    model: input.model,
    trigger: input.trigger,
    status: input.status,
    imageSource: input.imageSource,
    durationMs: Math.max(0, Math.floor(input.durationMs)),
    error: input.error,
    adminId: input.adminId,
    adminUsername: input.adminUsername,
  }
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  items.unshift(record)
  await kv.put(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))

  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      s.aiTotal += 1
      if (record.status === 'success') {
        s.aiSuccessCount += 1
        s.aiDurationSumMs += record.durationMs
      }
      if (record.createdAt.slice(0, 10) === s.day) {
        s.aiToday += 1
        if (record.status === 'success') s.aiSuccessToday += 1
        if (record.status === 'failed') s.aiFailedToday += 1
      }
    })
  } catch {
    /* ignore */
  }

  return record
}

export async function listAiUsage(
  kv: KVNamespace,
  limit = 500,
): Promise<AiUsageRecord[]> {
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  return items.slice(0, limit)
}

export type AiUsageSummary = {
  total: number
  success: number
  failed: number
  skipped: number
  todayTotal: number
  todaySuccess: number
  todayFailed: number
  avgDurationMs: number
  autoCount: number
  manualCount: number
}

export function summarizeAiUsage(
  rows: AiUsageRecord[],
  today = new Date().toISOString().slice(0, 10),
): AiUsageSummary {
  const successRows = rows.filter((r) => r.status === 'success')
  const todayRows = rows.filter((r) => r.createdAt.slice(0, 10) === today)
  const durations = successRows.map((r) => r.durationMs).filter((n) => n > 0)
  return {
    total: rows.length,
    success: successRows.length,
    failed: rows.filter((r) => r.status === 'failed').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    todayTotal: todayRows.length,
    todaySuccess: todayRows.filter((r) => r.status === 'success').length,
    todayFailed: todayRows.filter((r) => r.status === 'failed').length,
    avgDurationMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    autoCount: rows.filter((r) => r.trigger === 'auto').length,
    manualCount: rows.filter((r) => r.trigger === 'manual').length,
  }
}

/** Last N days trend buckets (inclusive of today). */
export function trendAiUsage(
  rows: AiUsageRecord[],
  days = 30,
): { date: string; total: number; success: number; failed: number }[] {
  const today = new Date()
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    keys.push(d.toISOString().slice(0, 10))
  }
  return keys.map((date) => {
    const day = rows.filter((r) => r.createdAt.slice(0, 10) === date)
    return {
      date,
      total: day.length,
      success: day.filter((r) => r.status === 'success').length,
      failed: day.filter((r) => r.status === 'failed').length,
    }
  })
}
