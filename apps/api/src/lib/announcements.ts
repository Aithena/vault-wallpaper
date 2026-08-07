export type AnnouncementStatus = 'draft' | 'published'

export type AnnouncementRecord = {
  id: string
  title: string
  content: string
  status: AnnouncementStatus
  createdAt: string
  updatedAt: string
  createdByAdminId?: string
}

const INDEX_KEY = 'announcements:index'

function annKey(id: string) {
  return `announcement:${id}`
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

async function writeIndex(kv: KVNamespace, ids: string[]) {
  await kv.put(INDEX_KEY, JSON.stringify(ids))
}

export async function listAnnouncements(
  kv: KVNamespace,
): Promise<AnnouncementRecord[]> {
  const ids = await readIndex(kv)
  const rows: AnnouncementRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(annKey(id))
    if (raw) rows.push(JSON.parse(raw) as AnnouncementRecord)
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return rows
}

export async function getAnnouncement(
  kv: KVNamespace,
  id: string,
): Promise<AnnouncementRecord | null> {
  const raw = await kv.get(annKey(id))
  return raw ? (JSON.parse(raw) as AnnouncementRecord) : null
}

export async function createAnnouncement(
  kv: KVNamespace,
  input: {
    title: string
    content?: string
    status?: AnnouncementStatus
    createdByAdminId?: string
  },
): Promise<AnnouncementRecord> {
  const now = new Date().toISOString()
  const record: AnnouncementRecord = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    content: input.content?.trim() || '',
    status: input.status === 'published' ? 'published' : 'draft',
    createdAt: now,
    updatedAt: now,
    createdByAdminId: input.createdByAdminId,
  }
  await kv.put(annKey(record.id), JSON.stringify(record))
  const ids = await readIndex(kv)
  ids.unshift(record.id)
  await writeIndex(kv, ids)
  return record
}

export async function updateAnnouncement(
  kv: KVNamespace,
  id: string,
  patch: { title?: string; content?: string; status?: AnnouncementStatus },
): Promise<AnnouncementRecord | null> {
  const record = await getAnnouncement(kv, id)
  if (!record) return null
  if (patch.title !== undefined) record.title = patch.title.trim()
  if (patch.content !== undefined) record.content = patch.content.trim()
  if (patch.status !== undefined) record.status = patch.status
  record.updatedAt = new Date().toISOString()
  await kv.put(annKey(id), JSON.stringify(record))
  return record
}

export async function deleteAnnouncement(
  kv: KVNamespace,
  id: string,
): Promise<boolean> {
  const record = await getAnnouncement(kv, id)
  if (!record) return false
  await kv.delete(annKey(id))
  await writeIndex(
    kv,
    (await readIndex(kv)).filter((x) => x !== id),
  )
  return true
}
