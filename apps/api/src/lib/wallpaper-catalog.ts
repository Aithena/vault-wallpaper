import type { MembershipTierId } from '@vault/shared'
import { wallpaperImageUrls } from './r2-wallpaper'
import { newWallpaperId } from './wallpaper-id'

export type WallpaperStatus =
  | 'pending'
  | 'rejected'
  | 'published'
  | 'unpublished'

export type WallpaperAiStatus = 'idle' | 'pending' | 'ready' | 'failed'

export type WallpaperRecord = {
  id: string
  title: string
  /** Human-confirmed description (may originate from AI). */
  description?: string
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
  aiStatus?: WallpaperAiStatus
  aiDescription?: string
  aiSuggestedTitle?: string
  aiSuggestedCategoryId?: string | null
  aiSuggestedTagIds?: string[]
  aiError?: string
  aiAnalyzedAt?: string
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
  const rows = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await kv.get(catKey(id))
        return raw ? (JSON.parse(raw) as CategoryRecord) : null
      }),
    )
  ).filter((r): r is CategoryRecord => Boolean(r))
  rows.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  return rows
}

export async function listTags(kv: KVNamespace): Promise<TagRecord[]> {
  const ids = await readIndex(kv, TAG_INDEX)
  const rows = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await kv.get(tagKey(id))
        return raw ? (JSON.parse(raw) as TagRecord) : null
      }),
    )
  ).filter((r): r is TagRecord => Boolean(r))
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
  const rows = (
    await Promise.all(ids.map((id) => getWallpaper(kv, id)))
  ).filter((wp): wp is WallpaperRecord => {
    if (!wp) return false
    if (!opts?.includeDeleted && wp.deletedAt) return false
    return true
  })
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return rows
}

export async function listPublishedWallpapers(kv: KVNamespace) {
  const all = await listWallpapers(kv)
  return all.filter((w) => w.status === 'published' && !w.deletedAt)
}

const PUBLIC_SNAPSHOT_KEY = 'wallpapers:public_catalog_v1'

export type PublicCatalogSnapshot = {
  updatedAt: string
  items: ReturnType<typeof toPublicWallpaper>[]
  categories: CategoryRecord[]
  tags: TagRecord[]
}

export async function invalidatePublicCatalogSnapshot(
  kv: KVNamespace,
): Promise<void> {
  await kv.delete(PUBLIC_SNAPSHOT_KEY)
}

async function buildPublicCatalogSnapshot(
  kv: KVNamespace,
): Promise<PublicCatalogSnapshot> {
  const [items, categories, tags] = await Promise.all([
    listPublishedWallpapers(kv),
    listCategories(kv),
    listTags(kv),
  ])
  const catMap = new Map(categories.map((c) => [c.id, c.name]))
  const tagMap = new Map(tags.map((t) => [t.id, t.name]))
  return {
    updatedAt: new Date().toISOString(),
    items: items.map((w) =>
      toPublicWallpaper(
        w,
        w.categoryId ? catMap.get(w.categoryId) : null,
        w.tagIds.map((id) => tagMap.get(id)).filter(Boolean) as string[],
      ),
    ),
    categories,
    tags,
  }
}

/** C-end catalog: 1 KV read when warm; rebuild + 1 write on miss. */
export async function getPublicCatalogSnapshot(
  kv: KVNamespace,
): Promise<PublicCatalogSnapshot> {
  const raw = await kv.get(PUBLIC_SNAPSHOT_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as PublicCatalogSnapshot
    } catch {
      /* rebuild */
    }
  }
  const snap = await buildPublicCatalogSnapshot(kv)
  await kv.put(PUBLIC_SNAPSHOT_KEY, JSON.stringify(snap))
  return snap
}

export async function ensureSeedCatalog(kv: KVNamespace): Promise<void> {
  const now = new Date().toISOString()

  // Categories / tags only when empty — never seed fake picsum wallpapers.
  const catIds = await readIndex(kv, CAT_INDEX)
  if (catIds.length === 0) {
    const cats: CategoryRecord[] = [
      { id: 'cat_nature', name: '自然', slug: 'nature', sort: 1, createdAt: now, updatedAt: now },
      { id: 'cat_city', name: '城市', slug: 'city', sort: 2, createdAt: now, updatedAt: now },
    ]
    for (const c of cats) {
      await kv.put(catKey(c.id), JSON.stringify(c))
    }
    await writeIndex(kv, CAT_INDEX, cats.map((c) => c.id))
  }

  const tagIds = await readIndex(kv, TAG_INDEX)
  if (tagIds.length === 0) {
    const tags: TagRecord[] = [
      { id: 'tag_aurora', name: '极光', slug: 'aurora', createdAt: now, updatedAt: now },
      { id: 'tag_harbor', name: '海港', slug: 'harbor', createdAt: now, updatedAt: now },
      { id: 'tag_night', name: '夜景', slug: 'night', createdAt: now, updatedAt: now },
    ]
    for (const t of tags) {
      await kv.put(tagKey(t.id), JSON.stringify(t))
    }
    await writeIndex(kv, TAG_INDEX, tags.map((t) => t.id))
  }

  // Ensure wallpaper index key exists so empty catalogs stay empty.
  const wpIds = await readIndex(kv, WP_INDEX)
  if (wpIds.length === 0) {
    const raw = await kv.get(WP_INDEX)
    if (raw == null) await writeIndex(kv, WP_INDEX, [])
  }
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
  await invalidatePublicCatalogSnapshot(kv)
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
  await invalidatePublicCatalogSnapshot(kv)
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
  await invalidatePublicCatalogSnapshot(kv)
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
  await invalidatePublicCatalogSnapshot(kv)
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
  await invalidatePublicCatalogSnapshot(kv)
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
  await invalidatePublicCatalogSnapshot(kv)
  return { ok: true }
}

export async function createWallpaper(
  kv: KVNamespace,
  input: Omit<
    WallpaperRecord,
    'id' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'hasOriginal'
  > & { id?: string; hasOriginal?: boolean },
): Promise<WallpaperRecord> {
  const now = new Date().toISOString()
  let id = input.id?.trim() || newWallpaperId()
  while (await getWallpaper(kv, id)) {
    id = newWallpaperId()
  }
  const record: WallpaperRecord = {
    ...input,
    id,
    title: input.title.trim(),
    status: 'pending',
    hasOriginal: Boolean(input.hasOriginal),
    tagIds: input.tagIds ?? [],
    aiStatus: input.aiStatus ?? 'idle',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await kv.put(wpKey(record.id), JSON.stringify(record))
  const ids = await readIndex(kv, WP_INDEX)
  if (!ids.includes(record.id)) ids.unshift(record.id)
  await writeIndex(kv, WP_INDEX, ids)
  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      s.wallpapersTotal += 1
      s.wallpapersPending += 1
    })
  } catch {
    /* ignore */
  }
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
  const wasPublic = record.status === 'published' && !record.deletedAt
  const isPublic = next.status === 'published' && !next.deletedAt
  if (wasPublic || isPublic) {
    await invalidatePublicCatalogSnapshot(kv)
  }
  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      if (record.status === 'pending' && next.status !== 'pending') {
        s.wallpapersPending = Math.max(0, s.wallpapersPending - 1)
      }
      if (record.status !== 'pending' && next.status === 'pending') {
        s.wallpapersPending += 1
      }
      if (record.status !== 'published' && next.status === 'published') {
        s.wallpapersPublished += 1
      }
      if (record.status === 'published' && next.status !== 'published') {
        s.wallpapersPublished = Math.max(0, s.wallpapersPublished - 1)
      }
      if (!record.deletedAt && next.deletedAt) {
        s.wallpapersTotal = Math.max(0, s.wallpapersTotal - 1)
        if (record.status === 'pending') {
          s.wallpapersPending = Math.max(0, s.wallpapersPending - 1)
        }
        if (record.status === 'published') {
          s.wallpapersPublished = Math.max(0, s.wallpapersPublished - 1)
        }
      }
    })
  } catch {
    /* ignore */
  }
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
  const urls = wallpaperImageUrls(w.id)
  // Prefer derived R2 URLs when we have an id; keep external previewUrl as-is for rare hand-filled links.
  const stored = w.previewUrl || ''
  const isExternal =
    /^https?:\/\//i.test(stored) && !stored.includes('/api/wallpapers/')
  return {
    id: w.id,
    title: w.title,
    description: w.description ?? '',
    previewUrl: isExternal ? stored : urls.previewUrl,
    thumbUrl: isExternal ? stored : urls.thumbUrl,
    mediumUrl: isExternal ? stored : urls.mediumUrl,
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
    aiStatus: w.aiStatus ?? 'idle',
    aiDescription: w.aiDescription ?? '',
    aiSuggestedTitle: w.aiSuggestedTitle ?? '',
    aiSuggestedCategoryId: w.aiSuggestedCategoryId ?? null,
    aiSuggestedTagIds: w.aiSuggestedTagIds ?? [],
    aiError: w.aiError ?? null,
    aiAnalyzedAt: w.aiAnalyzedAt ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}
