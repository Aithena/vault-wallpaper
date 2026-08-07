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

const INDEX_KEY = 'ai_usage:index'
const MAX_INDEX = 2000

function usageKey(id: string) {
  return `ai_usage:${id}`
}

async function readIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function writeAiUsage(
  kv: KVNamespace,
  input: Omit<AiUsageRecord, 'id' | 'createdAt'> & { createdAt?: string },
): Promise<AiUsageRecord> {
  const id = crypto.randomUUID()
  const record: AiUsageRecord = {
    id,
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
  await kv.put(usageKey(id), JSON.stringify(record))
  const ids = await readIndex(kv)
  ids.unshift(id)
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
  return record
}

export async function listAiUsage(
  kv: KVNamespace,
  limit = 500,
): Promise<AiUsageRecord[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows: AiUsageRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(usageKey(id))
    if (raw) rows.push(JSON.parse(raw) as AiUsageRecord)
  }
  return rows
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

export function summarizeAiUsage(rows: AiUsageRecord[], today = new Date().toISOString().slice(0, 10)): AiUsageSummary {
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
