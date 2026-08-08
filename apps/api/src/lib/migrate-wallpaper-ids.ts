import {
  getWallpaper,
  listWallpapers,
  invalidatePublicCatalogSnapshot,
  type WallpaperRecord,
} from './wallpaper-catalog'
import { isNanoidWallpaperId, newWallpaperId } from './wallpaper-id'
import { originalKey, previewApiPath, previewKey } from './r2-wallpaper'
import { listDownloads } from './downloads'
import { listAiUsage } from './ai-usage'

/** v2: plain 16-char alphanumeric (no w_ prefix / underscores). */
const FLAG_KEY = 'wallpapers:nanoid_migrated_v2'
const WP_INDEX = 'wallpapers:index'

function wpKey(id: string) {
  return `wallpaper:${id}`
}

async function moveR2Object(
  r2: R2Bucket,
  fromKey: string,
  toKey: string,
): Promise<boolean> {
  if (fromKey === toKey) return true
  const obj = await r2.get(fromKey)
  if (!obj) return false
  await r2.put(toKey, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  })
  await r2.delete(fromKey)
  return true
}

async function rewriteWallpaperIdRefs(
  kv: KVNamespace,
  mapping: Map<string, string>,
): Promise<void> {
  if (mapping.size === 0) return

  const downloads = await listDownloads(kv, 1000)
  for (const d of downloads) {
    const nextId = mapping.get(d.wallpaperId)
    if (!nextId) continue
    await kv.put(
      `download:${d.id}`,
      JSON.stringify({ ...d, wallpaperId: nextId }),
    )
  }

  const usages = await listAiUsage(kv, 2000)
  for (const u of usages) {
    const nextId = mapping.get(u.wallpaperId)
    if (!nextId) continue
    await kv.put(
      `ai_usage:${u.id}`,
      JSON.stringify({ ...u, wallpaperId: nextId }),
    )
  }
}

function rewritePreviewUrl(url: string, oldId: string, newId: string): string {
  if (!url) return url
  const oldPath = previewApiPath(oldId)
  const newPath = previewApiPath(newId)
  if (url === oldPath || url.endsWith(oldPath)) {
    return url.replace(oldPath, newPath)
  }
  // common absolute forms
  return url.split(oldId).join(newId)
}

async function migrateOne(
  kv: KVNamespace,
  r2: R2Bucket | undefined,
  wp: WallpaperRecord,
): Promise<string | null> {
  if (isNanoidWallpaperId(wp.id)) return null

  let newId = newWallpaperId()
  while (await getWallpaper(kv, newId)) {
    newId = newWallpaperId()
  }

  if (r2) {
    await moveR2Object(r2, originalKey(wp.id), originalKey(newId))
    await moveR2Object(r2, previewKey(wp.id), previewKey(newId))
  }

  const next: WallpaperRecord = {
    ...wp,
    id: newId,
    previewUrl: rewritePreviewUrl(wp.previewUrl, wp.id, newId),
    updatedAt: new Date().toISOString(),
  }

  await kv.put(wpKey(newId), JSON.stringify(next))
  await kv.delete(wpKey(wp.id))
  return newId
}

/**
 * One-shot: rewrite legacy wallpaper ids (e.g. wp-aurora) to nanoid,
 * rename R2 originals/previews keys, and remap download / AI usage refs.
 */
export async function migrateWallpaperIdsIfNeeded(
  kv: KVNamespace,
  r2?: R2Bucket,
): Promise<{ migrated: number; mapping: Record<string, string> }> {
  const done = await kv.get(FLAG_KEY)
  if (done === '1') {
    return { migrated: 0, mapping: {} }
  }

  const all = await listWallpapers(kv, { includeDeleted: true })
  const mapping = new Map<string, string>()
  const newIndex: string[] = []

  for (const wp of all) {
    const newId = await migrateOne(kv, r2, wp)
    if (newId) {
      mapping.set(wp.id, newId)
      newIndex.push(newId)
    } else {
      newIndex.push(wp.id)
    }
  }

  // Keep index order: replace any leftover raw index entries
  const rawIndex = await kv.get(WP_INDEX)
  let indexIds: string[] = []
  if (rawIndex) {
    try {
      indexIds = JSON.parse(rawIndex) as string[]
    } catch {
      indexIds = []
    }
  }
  if (indexIds.length) {
    const rewritten = indexIds.map((id) => mapping.get(id) ?? id)
    // dedupe while preserving order
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const id of rewritten) {
      if (seen.has(id)) continue
      seen.add(id)
      deduped.push(id)
    }
    await kv.put(WP_INDEX, JSON.stringify(deduped))
  } else if (newIndex.length) {
    await kv.put(WP_INDEX, JSON.stringify(newIndex))
  }

  await rewriteWallpaperIdRefs(kv, mapping)
  await kv.put(FLAG_KEY, '1')
  await invalidatePublicCatalogSnapshot(kv)

  return {
    migrated: mapping.size,
    mapping: Object.fromEntries(mapping),
  }
}
