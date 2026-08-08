export type DownloadRecord = {
  id: string
  userId: string
  email: string
  wallpaperId: string
  wallpaperTitle: string
  tierAtTime: string | null
  success: boolean
  error?: string
  createdAt: string
}

const RECENT_KEY = 'downloads:recent_v1'
const MAX_RECENT = 1000
const LEGACY_INDEX_KEY = 'downloads:index'

function downloadKey(id: string) {
  return `download:${id}`
}

async function readRecent(kv: KVNamespace): Promise<DownloadRecord[] | null> {
  const raw = await kv.get(RECENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DownloadRecord[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function migrateFromLegacy(kv: KVNamespace): Promise<DownloadRecord[]> {
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
        const r = await kv.get(downloadKey(id))
        return r ? (JSON.parse(r) as DownloadRecord) : null
      }),
    )
  ).filter((r): r is DownloadRecord => Boolean(r))
  if (rows.length) {
    await kv.put(RECENT_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)))
  }
  return rows
}

export async function writeDownload(
  kv: KVNamespace,
  input: {
    userId: string
    email: string
    wallpaperId: string
    wallpaperTitle: string
    tierAtTime: string | null
    success: boolean
    error?: string
  },
): Promise<DownloadRecord> {
  const record: DownloadRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    email: input.email,
    wallpaperId: input.wallpaperId,
    wallpaperTitle: input.wallpaperTitle,
    tierAtTime: input.tierAtTime,
    success: input.success,
    error: input.error,
    createdAt: new Date().toISOString(),
  }
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  items.unshift(record)
  await kv.put(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))

  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      s.downloadsTotal += 1
      if (record.createdAt.slice(0, 10) === s.day) {
        s.downloadsToday += 1
        if (record.success) s.downloadsSuccessToday += 1
      }
    })
  } catch {
    /* ignore */
  }

  return record
}

export async function listDownloads(
  kv: KVNamespace,
  limit = 200,
): Promise<DownloadRecord[]> {
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  return items.slice(0, limit)
}
