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

const INDEX_KEY = 'downloads:index'
const MAX_INDEX = 1000

function downloadKey(id: string) {
  return `download:${id}`
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
  const id = crypto.randomUUID()
  const record: DownloadRecord = {
    id,
    userId: input.userId,
    email: input.email,
    wallpaperId: input.wallpaperId,
    wallpaperTitle: input.wallpaperTitle,
    tierAtTime: input.tierAtTime,
    success: input.success,
    error: input.error,
    createdAt: new Date().toISOString(),
  }
  await kv.put(downloadKey(id), JSON.stringify(record))
  const ids = await readIndex(kv)
  ids.unshift(id)
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
  return record
}

export async function listDownloads(
  kv: KVNamespace,
  limit = 200,
): Promise<DownloadRecord[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows: DownloadRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(downloadKey(id))
    if (raw) rows.push(JSON.parse(raw) as DownloadRecord)
  }
  return rows
}
