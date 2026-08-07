import type { MembershipTierId } from '@vault/shared'

export type WallpaperStatus =
  | 'pending'
  | 'rejected'
  | 'published'
  | 'unpublished'

export type WallpaperRecord = {
  id: string
  title: string
  previewUrl: string
  width: number
  height: number
  tierRequired: MembershipTierId
  status: WallpaperStatus
  categoryId: string | null
  tagIds: string[]
  hasOriginal: boolean
  rejectReason?: string
  createdByAdminId?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export type CategoryRecord = {
  id: string
  name: string
  slug: string
  sort: number
  createdByAdminId?: string
  createdAt: string
  updatedAt: string
}

export type TagRecord = {
  id: string
  name: string
  slug: string
  createdByAdminId?: string
  createdAt: string
  updatedAt: string
}

const WP_INDEX = 'wallpapers:index'
const CAT_INDEX = 'categories:index'
const TAG_INDEX = 'tags:index'

function wpKey(id: string) {
  return `wallpaper:${id}`
}
function catKey(id: string) {
  return `category:${id}`
}
function tagKey(id: string) {
  return `tag:${id}`
}

async function readIndex(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeIndex(kv: KVNamespace, key: string, ids: string[]) {
  await kv.put(key, JSON.stringify(ids))
}

export async function listCategories(kv: KVNamespace): Promise<CategoryRecord[]> {
  const ids = await readIndex(kv, CAT_INDEX)
  const rows: CategoryRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(catKey(id))
    if (raw) rows.push(JSON.parse(raw) as CategoryRecord)
  }
  rows.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  return rows
}

export async function listTags(kv: KVNamespace): Promise<TagRecord[]> {
  const ids = await readIndex(kv, TAG_INDEX)
  const rows: TagRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(tagKey(id))
    if (raw) rows.push(JSON.parse(raw) as TagRecord)
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

export async function getWallpaper(
  kv: KVNamespace,
  id: string,
): Promise<WallpaperRecord | null> {
  const raw = await kv.get(wpKey(id))
  return raw ? (JSON.parse(raw) as WallpaperRecord) : null
}

export async function listWallpapers(
  kv: KVNamespace,
  opts?: { includeDeleted?: boolean },
): Promise<WallpaperRecord[]> {
  const ids = await readIndex(kv, WP_INDEX)
  const rows: WallpaperRecord[] = []
  for (const id of ids) {
    const wp = await getWallpaper(kv, id)
    if (!wp) continue
    if (!opts?.includeDeleted && wp.deletedAt) continue
    rows.push(wp)
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return rows
}

export async function listPublishedWallpapers(kv: KVNamespace) {
  const all = await listWallpapers(kv)
  return all.filter((w) => w.status === 'published' && !w.deletedAt)
}

export async function ensureSeedCatalog(kv: KVNamespace): Promise<void> {
  const existing = await readIndex(kv, WP_INDEX)
  if (existing.length > 0) return

  const now = new Date().toISOString()
  const cats: CategoryRecord[] = [
    { id: 'cat_nature', name: '自然', slug: 'nature', sort: 1, createdAt: now, updatedAt: now },
    { id: 'cat_city', name: '城市', slug: 'city', sort: 2, createdAt: now, updatedAt: now },
  ]
  for (const c of cats) {
    await kv.put(catKey(c.id), JSON.stringify(c))
  }
  await writeIndex(kv, CAT_INDEX, cats.map((c) => c.id))

  const tags: TagRecord[] = [
    { id: 'tag_aurora', name: '极光', slug: 'aurora', createdAt: now, updatedAt: now },
    { id: 'tag_harbor', name: '海港', slug: 'harbor', createdAt: now, updatedAt: now },
    { id: 'tag_night', name: '夜景', slug: 'night', createdAt: now, updatedAt: now },
  ]
  for (const t of tags) {
    await kv.put(tagKey(t.id), JSON.stringify(t))
  }
  await writeIndex(kv, TAG_INDEX, tags.map((t) => t.id))

  const seeds: WallpaperRecord[] = [
    {
      id: 'wp-aurora',
      title: '极光山脊',
      previewUrl: 'https://picsum.photos/seed/vault-aurora/640/360',
      width: 3840,
      height: 2160,
      tierRequired: 'free',
      status: 'published',
      categoryId: 'cat_nature',
      tagIds: ['tag_aurora'],
      hasOriginal: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'wp-harbor',
      title: '雾港清晨',
      previewUrl: 'https://picsum.photos/seed/vault-harbor/640/360',
      width: 3840,
      height: 2160,
      tierRequired: 'pro',
      status: 'published',
      categoryId: 'cat_city',
      tagIds: ['tag_harbor'],
      hasOriginal: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'wp-neon',
      title: '夜城霓虹',
      previewUrl: 'https://picsum.photos/seed/vault-neon/640/360',
      width: 3840,
      height: 2160,
      tierRequired: 'max',
      status: 'published',
      categoryId: 'cat_city',
      tagIds: ['tag_night'],
      hasOriginal: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
  for (const w of seeds) {
    await kv.put(wpKey(w.id), JSON.stringify(w))
  }
  await writeIndex(kv, WP_INDEX, seeds.map((w) => w.id))
}

export async function createCategory(
  kv: KVNamespace,
  input: { name: string; slug: string; sort?: number; createdByAdminId?: string },
): Promise<CategoryRecord> {
  const now = new Date().toISOString()
  const record: CategoryRecord = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    sort: input.sort ?? 99,
    createdByAdminId: input.createdByAdminId,
    createdAt: now,
    updatedAt: now,
  }
  await kv.put(catKey(record.id), JSON.stringify(record))
  const ids = await readIndex(kv, CAT_INDEX)
  ids.push(record.id)
  await writeIndex(kv, CAT_INDEX, ids)
  return record
}

export async function updateCategory(
  kv: KVNamespace,
  id: string,
  patch: { name?: string; slug?: string; sort?: number },
): Promise<CategoryRecord | null> {
  const raw = await kv.get(catKey(id))
  if (!raw) return null
  const record = JSON.parse(raw) as CategoryRecord
  if (patch.name !== undefined) record.name = patch.name.trim()
  if (patch.slug !== undefined) record.slug = patch.slug.trim().toLowerCase()
  if (patch.sort !== undefined) record.sort = patch.sort
  record.updatedAt = new Date().toISOString()
  await kv.put(catKey(id), JSON.stringify(record))
  return record
}

export async function deleteCategory(
  kv: KVNamespace,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wps = await listWallpapers(kv)
  if (wps.some((w) => w.categoryId === id)) {
    return { ok: false, error: 'category_in_use' }
  }
  await kv.delete(catKey(id))
  await writeIndex(
    kv,
    CAT_INDEX,
    (await readIndex(kv, CAT_INDEX)).filter((x) => x !== id),
  )
  return { ok: true }
}

export async function createTag(
  kv: KVNamespace,
  input: { name: string; slug: string; createdByAdminId?: string },
): Promise<TagRecord> {
  const now = new Date().toISOString()
  const record: TagRecord = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    createdByAdminId: input.createdByAdminId,
    createdAt: now,
    updatedAt: now,
  }
  await kv.put(tagKey(record.id), JSON.stringify(record))
  const ids = await readIndex(kv, TAG_INDEX)
  ids.push(record.id)
  await writeIndex(kv, TAG_INDEX, ids)
  return record
}

export async function updateTag(
  kv: KVNamespace,
  id: string,
  patch: { name?: string; slug?: string },
): Promise<TagRecord | null> {
  const raw = await kv.get(tagKey(id))
  if (!raw) return null
  const record = JSON.parse(raw) as TagRecord
  if (patch.name !== undefined) record.name = patch.name.trim()
  if (patch.slug !== undefined) record.slug = patch.slug.trim().toLowerCase()
  record.updatedAt = new Date().toISOString()
  await kv.put(tagKey(id), JSON.stringify(record))
  return record
}

export async function deleteTag(
  kv: KVNamespace,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wps = await listWallpapers(kv)
  if (wps.some((w) => w.tagIds.includes(id))) {
    return { ok: false, error: 'tag_in_use' }
  }
  await kv.delete(tagKey(id))
  await writeIndex(
    kv,
    TAG_INDEX,
    (await readIndex(kv, TAG_INDEX)).filter((x) => x !== id),
  )
  return { ok: true }
}

export async function createWallpaper(
  kv: KVNamespace,
  input: Omit<
    WallpaperRecord,
    'status' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'hasOriginal'
  > & { hasOriginal?: boolean },
): Promise<WallpaperRecord> {
  const now = new Date().toISOString()
  const record: WallpaperRecord = {
    ...input,
    title: input.title.trim(),
    status: 'pending',
    hasOriginal: Boolean(input.hasOriginal),
    tagIds: input.tagIds ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await kv.put(wpKey(record.id), JSON.stringify(record))
  const ids = await readIndex(kv, WP_INDEX)
  if (!ids.includes(record.id)) ids.unshift(record.id)
  await writeIndex(kv, WP_INDEX, ids)
  return record
}

export async function updateWallpaper(
  kv: KVNamespace,
  id: string,
  patch: Partial<WallpaperRecord>,
): Promise<WallpaperRecord | null> {
  const record = await getWallpaper(kv, id)
  if (!record || record.deletedAt) return null
  const next: WallpaperRecord = {
    ...record,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ),
    id: record.id,
    updatedAt: new Date().toISOString(),
  }
  if (patch.rejectReason === '') delete next.rejectReason
  await kv.put(wpKey(id), JSON.stringify(next))
  return next
}

export async function softDeleteWallpaper(
  kv: KVNamespace,
  id: string,
): Promise<WallpaperRecord | null> {
  return updateWallpaper(kv, id, {
    deletedAt: new Date().toISOString(),
    status: 'unpublished',
  })
}

export function toPublicWallpaper(
  w: WallpaperRecord,
  categoryName?: string | null,
  tagNames?: string[],
) {
  return {
    id: w.id,
    title: w.title,
    previewUrl: w.previewUrl,
    width: w.width,
    height: w.height,
    tierRequired: w.tierRequired,
    status: w.status,
    categoryId: w.categoryId,
    category: categoryName ?? null,
    tagIds: w.tagIds,
    tags: tagNames ?? [],
    hasOriginal: w.hasOriginal,
    rejectReason: w.rejectReason ?? null,
    createdByAdminId: w.createdByAdminId ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}
