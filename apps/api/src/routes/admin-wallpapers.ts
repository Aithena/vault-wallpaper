import { Hono } from 'hono'
import type { MembershipTierId } from '@vault/shared'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { requireButton, requireMenu } from '../lib/admin-perm'
import { writeAudit } from '../lib/audit'
import { isMembershipTierId } from '../lib/catalog'
import {
  createCategory,
  createTag,
  createWallpaper,
  deleteCategory,
  deleteTag,
  ensureSeedCatalog,
  getWallpaper,
  listCategories,
  listTags,
  listWallpapers,
  softDeleteWallpaper,
  toPublicWallpaper,
  updateCategory,
  updateTag,
  updateWallpaper,
  type WallpaperStatus,
} from '../lib/wallpaper-catalog'
import { migrateWallpaperIdsIfNeeded } from '../lib/migrate-wallpaper-ids'
import {
  safeResolveTodosForWallpaper,
  safeUpsertAdminTodo,
} from '../lib/admin-todos'
import {
  headOriginal,
  previewApiPath,
  putOriginal,
  putPreview,
  deleteWallpaperObjects,
} from '../lib/r2-wallpaper'
import { assertOwned, filterOwned, getActorScope } from '../lib/admin-scope'
import { paginate, parsePageQuery } from '../lib/paging'
import {
  analyzeWallpaperAi,
  markAiPending,
  scheduleWallpaperAi,
} from '../lib/wallpaper-ai'

export const adminWallpapersRoutes = new Hono<AppEnv>()
adminWallpapersRoutes.use('*', requireAdmin)

function asUploadFile(value: unknown): File | null {
  if (value instanceof File && value.size > 0) return value
  return null
}

async function loadMaps(kv: KVNamespace, r2?: R2Bucket) {
  await ensureSeedCatalog(kv)
  await migrateWallpaperIdsIfNeeded(kv, r2)
  const [wallpapers, categories, tags] = await Promise.all([
    listWallpapers(kv),
    listCategories(kv),
    listTags(kv),
  ])
  const catMap = new Map(categories.map((c) => [c.id, c.name]))
  const tagMap = new Map(tags.map((t) => [t.id, t.name]))
  return { wallpapers, categories, tags, catMap, tagMap }
}

function mapWallpaper(
  w: Awaited<ReturnType<typeof listWallpapers>>[number],
  catMap: Map<string, string>,
  tagMap: Map<string, string>,
) {
  return toPublicWallpaper(
    w,
    w.categoryId ? catMap.get(w.categoryId) ?? null : null,
    w.tagIds.map((id) => tagMap.get(id)).filter(Boolean) as string[],
  )
}

adminWallpapersRoutes.get('/', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.list')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const { wallpapers, catMap, tagMap } = await loadMaps(c.env.KV, c.env.R2)
  const scoped = filterOwned(wallpapers, scope, admin.id)
  const q = c.req.query('q')?.trim().toLowerCase()
  const status = c.req.query('status')?.trim()
  const category = c.req.query('category')?.trim()
  const aiStatus = c.req.query('aiStatus')?.trim()

  let filtered = scoped
  if (status) filtered = filtered.filter((w) => w.status === status)
  if (aiStatus) {
    filtered = filtered.filter((w) => (w.aiStatus ?? 'idle') === aiStatus)
  }
  if (q) filtered = filtered.filter((w) => w.title.toLowerCase().includes(q))
  if (category) {
    const catLower = category.toLowerCase()
    filtered = filtered.filter((w) => {
      if (w.categoryId === category) return true
      const name = w.categoryId ? catMap.get(w.categoryId) : null
      return name?.toLowerCase() === catLower
    })
  }

  const { page, pageSize } = parsePageQuery(c.req.query())
  const paged = paginate(filtered, page, pageSize)
  return c.json({
    wallpapers: paged.items.map((w) => mapWallpaper(w, catMap, tagMap)),
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
  })
})

adminWallpapersRoutes.get('/taxonomy', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.list')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const { wallpapers, categories, tags } = await loadMaps(c.env.KV, c.env.R2)
  const scopedWp = filterOwned(wallpapers, scope, admin.id)
  const scopedCats = filterOwned(categories, scope, admin.id)
  const scopedTags = filterOwned(tags, scope, admin.id)
  return c.json({
    categories: scopedCats.map((cat) => ({
      ...cat,
      wallpaperCount: scopedWp.filter((w) => w.categoryId === cat.id).length,
    })),
    tags: scopedTags.map((tag) => ({
      ...tag,
      wallpaperCount: scopedWp.filter((w) => w.tagIds.includes(tag.id)).length,
    })),
  })
})

adminWallpapersRoutes.get('/categories', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.categories')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const { wallpapers, categories } = await loadMaps(c.env.KV, c.env.R2)
  const scopedWp = filterOwned(wallpapers, scope, admin.id)
  const scopedCats = filterOwned(categories, scope, admin.id)
  return c.json({
    categories: scopedCats.map((cat) => ({
      ...cat,
      wallpaperCount: scopedWp.filter((w) => w.categoryId === cat.id).length,
    })),
  })
})

adminWallpapersRoutes.post('/categories', async (c) => {
  const denied = await requireButton(c, 'wallpapers.categories.create')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
    sort?: number
  }
  if (!body.name?.trim() || !body.slug?.trim()) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  await ensureSeedCatalog(c.env.KV)
  const { admin } = await getActorScope(c)
  const category = await createCategory(c.env.KV, {
    name: body.name,
    slug: body.slug,
    sort: body.sort,
    createdByAdminId: admin.id,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.categories.create',
    target: `category:${category.id}`,
  })
  return c.json({ ok: true, category }, 201)
})

adminWallpapersRoutes.patch('/categories/:id', async (c) => {
  const denied = await requireButton(c, 'wallpapers.categories.edit')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const categories = await listCategories(c.env.KV)
  const existing = categories.find((cat) => cat.id === c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
    sort?: number
  }
  const category = await updateCategory(c.env.KV, c.req.param('id'), body)
  if (!category) return c.json({ error: 'not_found' }, 404)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.categories.edit',
    target: `category:${category.id}`,
  })
  return c.json({ ok: true, category })
})

adminWallpapersRoutes.delete('/categories/:id', async (c) => {
  const denied = await requireButton(c, 'wallpapers.categories.delete')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const categories = await listCategories(c.env.KV)
  const existing = categories.find((cat) => cat.id === c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const result = await deleteCategory(c.env.KV, c.req.param('id'))
  if (!result.ok) return c.json({ error: result.error }, 400)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.categories.delete',
    target: `category:${c.req.param('id')}`,
  })
  return c.json({ ok: true })
})

adminWallpapersRoutes.get('/tags', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.tags')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const { wallpapers, tags } = await loadMaps(c.env.KV, c.env.R2)
  const scopedWp = filterOwned(wallpapers, scope, admin.id)
  const scopedTags = filterOwned(tags, scope, admin.id)
  return c.json({
    tags: scopedTags.map((tag) => ({
      ...tag,
      wallpaperCount: scopedWp.filter((w) => w.tagIds.includes(tag.id)).length,
    })),
  })
})

adminWallpapersRoutes.post('/tags', async (c) => {
  const denied = await requireButton(c, 'wallpapers.tags.create')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
  }
  if (!body.name?.trim() || !body.slug?.trim()) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  await ensureSeedCatalog(c.env.KV)
  const { admin } = await getActorScope(c)
  const tag = await createTag(c.env.KV, {
    name: body.name,
    slug: body.slug,
    createdByAdminId: admin.id,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.tags.create',
    target: `tag:${tag.id}`,
  })
  return c.json({ ok: true, tag }, 201)
})

adminWallpapersRoutes.patch('/tags/:id', async (c) => {
  const denied = await requireButton(c, 'wallpapers.tags.edit')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const tags = await listTags(c.env.KV)
  const existing = tags.find((t) => t.id === c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
  }
  const tag = await updateTag(c.env.KV, c.req.param('id'), body)
  if (!tag) return c.json({ error: 'not_found' }, 404)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.tags.edit',
    target: `tag:${tag.id}`,
  })
  return c.json({ ok: true, tag })
})

adminWallpapersRoutes.delete('/tags/:id', async (c) => {
  const denied = await requireButton(c, 'wallpapers.tags.delete')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const tags = await listTags(c.env.KV)
  const existing = tags.find((t) => t.id === c.req.param('id'))
  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const result = await deleteTag(c.env.KV, c.req.param('id'))
  if (!result.ok) return c.json({ error: result.error }, 400)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.tags.delete',
    target: `tag:${c.req.param('id')}`,
  })
  return c.json({ ok: true })
})

adminWallpapersRoutes.post('/', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.upload')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    previewUrl?: string
    width?: number
    height?: number
    tierRequired?: string
    categoryId?: string | null
    tagIds?: string[]
    hasOriginal?: boolean
  }
  if (!body.title?.trim() || !body.tierRequired) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  if (!isMembershipTierId(body.tierRequired)) {
    return c.json({ error: 'invalid_tier' }, 400)
  }
  await ensureSeedCatalog(c.env.KV)
  await migrateWallpaperIdsIfNeeded(c.env.KV, c.env.R2)
  const admin = c.get('admin')!
  const wp = await createWallpaper(c.env.KV, {
    title: body.title,
    previewUrl: body.previewUrl || '',
    width: body.width || 3840,
    height: body.height || 2160,
    tierRequired: body.tierRequired as MembershipTierId,
    categoryId: body.categoryId ?? null,
    tagIds: body.tagIds ?? [],
    hasOriginal: Boolean(body.hasOriginal),
    createdByAdminId: admin.id,
  })
  await safeUpsertAdminTodo(c.env.KV, {
    type: 'wallpaper_pending',
    wallpaperId: wp.id,
    wallpaperTitle: wp.title,
    createdByAdminId: admin.id,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.upload',
    target: `wallpaper:${wp.id}`,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp) }, 201)
})

adminWallpapersRoutes.post('/batch', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.batch')
  if (denied) return denied
  const body = (await c.req.json().catch(() => ({}))) as {
    action?: 'approve' | 'unpublish' | 'delete' | 'set_category'
    ids?: string[]
    categoryId?: string | null
  }
  if (!body.action || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  if (body.action === 'set_category' && body.categoryId === undefined) {
    return c.json({ error: 'category_required' }, 400)
  }

  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const id of body.ids) {
    const existing = await getWallpaper(c.env.KV, id)
    if (!existing || existing.deletedAt) {
      results.push({ id, ok: false, error: 'not_found' })
      continue
    }
    if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
      results.push({ id, ok: false, error: 'forbidden_scope' })
      continue
    }

    if (body.action === 'approve') {
      const hasFile = await headOriginal(c.env.R2, id)
      if (!hasFile && !existing.hasOriginal) {
        results.push({ id, ok: false, error: 'original_required' })
        continue
      }
      if (existing.status !== 'pending') {
        results.push({ id, ok: false, error: 'invalid_status' })
        continue
      }
      await updateWallpaper(c.env.KV, id, {
        status: 'published',
        hasOriginal: true,
        rejectReason: '',
      })
      await safeResolveTodosForWallpaper(c.env.KV, id)
      results.push({ id, ok: true })
    } else if (body.action === 'unpublish') {
      if (existing.status !== 'published') {
        results.push({ id, ok: false, error: 'invalid_status' })
        continue
      }
      await updateWallpaper(c.env.KV, id, { status: 'unpublished' })
      results.push({ id, ok: true })
    } else if (body.action === 'delete') {
      await softDeleteWallpaper(c.env.KV, id)
      await deleteWallpaperObjects(c.env.R2, id)
      await safeResolveTodosForWallpaper(c.env.KV, id)
      results.push({ id, ok: true })
    } else if (body.action === 'set_category') {
      await updateWallpaper(c.env.KV, id, {
        categoryId: body.categoryId ?? null,
      })
      results.push({ id, ok: true })
    }
  }

  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: `wallpapers.list.batch.${body.action}`,
    target: `wallpapers:${body.ids.length}`,
    detail: JSON.stringify(results),
  })

  return c.json({
    ok: true,
    results,
    successCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  })
})

adminWallpapersRoutes.get('/:id', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.list')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const { catMap, tagMap } = await loadMaps(c.env.KV, c.env.R2)
  const wp = await getWallpaper(c.env.KV, c.req.param('id'))
  if (!wp || wp.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, wp.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  return c.json({ wallpaper: mapWallpaper(wp, catMap, tagMap) })
})

adminWallpapersRoutes.post('/:id/original', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.upload')
  if (denied) return denied
  if (!c.env.R2) return c.json({ error: 'r2_unavailable' }, 503)

  const id = c.req.param('id')
  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }

  const form = await c.req.parseBody({ all: true })
  const file = asUploadFile(form.file)
  if (!file) return c.json({ error: 'file_required' }, 400)

  await putOriginal(c.env.R2, id, await file.arrayBuffer(), file.type || 'image/jpeg')
  const wp = await updateWallpaper(c.env.KV, id, { hasOriginal: true })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.upload_original',
    target: `wallpaper:${id}`,
    detail: file.name,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp!) })
})

adminWallpapersRoutes.post('/:id/preview', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.upload')
  if (denied) return denied
  if (!c.env.R2) return c.json({ error: 'r2_unavailable' }, 503)

  const id = c.req.param('id')
  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }

  const form = await c.req.parseBody({ all: true })
  const file = asUploadFile(form.file)
  if (!file) return c.json({ error: 'file_required' }, 400)

  await putPreview(c.env.R2, id, await file.arrayBuffer(), file.type || 'image/jpeg')
  const previewUrl = previewApiPath(id)
  const wp = await updateWallpaper(c.env.KV, id, { previewUrl })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.upload_preview',
    target: `wallpaper:${id}`,
    detail: file.name,
  })
  scheduleWallpaperAi(c.executionCtx, c.env, id, {
    trigger: 'auto',
    adminId: admin.id,
    adminUsername: admin.username,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp!), previewUrl })
})

/** Re-run Workers AI analysis (sync). Suggestions only — does not overwrite taxonomy. */
adminWallpapersRoutes.post('/:id/ai-analyze', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.ai')
  if (denied) return denied
  const id = c.req.param('id')
  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }

  await markAiPending(c.env.KV, id)
  const result = await analyzeWallpaperAi(c.env, id, {
    trigger: 'manual',
    adminId: admin.id,
    adminUsername: admin.username,
  })
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.ai',
    target: `wallpaper:${id}`,
    detail: result.ok ? 'ready' : result.error,
  })
  if (!result.ok) {
    const wp = await getWallpaper(c.env.KV, id)
    return c.json(
      {
        ok: false,
        error: result.error,
        wallpaper: wp ? toPublicWallpaper(wp) : null,
      },
      result.error === 'ai_unavailable' ? 503 : 400,
    )
  }
  return c.json({ ok: true, wallpaper: toPublicWallpaper(result.wallpaper) })
})

/** Apply AI suggestions into editable fields (title/description/category/tags). */
adminWallpapersRoutes.post('/:id/ai-apply', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.edit')
  if (denied) return denied
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    applyTitle?: boolean
    applyDescription?: boolean
    applyCategory?: boolean
    applyTags?: boolean
  }
  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  if ((existing.aiStatus ?? 'idle') !== 'ready') {
    return c.json({ error: 'ai_not_ready' }, 400)
  }

  const patch: Partial<typeof existing> = {}
  if (body.applyTitle !== false && existing.aiSuggestedTitle) {
    patch.title = existing.aiSuggestedTitle
  }
  if (body.applyDescription !== false && existing.aiDescription) {
    patch.description = existing.aiDescription
  }
  if (body.applyCategory !== false && existing.aiSuggestedCategoryId) {
    patch.categoryId = existing.aiSuggestedCategoryId
  }
  if (body.applyTags !== false && existing.aiSuggestedTagIds?.length) {
    patch.tagIds = existing.aiSuggestedTagIds
  }

  const wp = await updateWallpaper(c.env.KV, id, patch)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.ai_apply',
    target: `wallpaper:${id}`,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp!) })
})

adminWallpapersRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    description?: string
    previewUrl?: string
    width?: number
    height?: number
    tierRequired?: MembershipTierId
    categoryId?: string | null
    tagIds?: string[]
    hasOriginal?: boolean
    status?: WallpaperStatus
    rejectReason?: string
  }

  if (body.status === 'published') {
    const denied = await requireButton(c, 'wallpapers.list.approve')
    if (denied) return denied
  } else if (body.status === 'rejected') {
    const denied = await requireButton(c, 'wallpapers.list.reject')
    if (denied) return denied
  } else if (body.status === 'unpublished') {
    const denied = await requireButton(c, 'wallpapers.list.unpublish')
    if (denied) return denied
  } else if (body.status === 'pending') {
    const denied = await requireButton(c, 'wallpapers.list.edit')
    if (denied) return denied
  } else {
    const denied = await requireButton(c, 'wallpapers.list.edit')
    if (denied) return denied
  }

  await ensureSeedCatalog(c.env.KV)
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }

  // 已下架/已驳回再上架：只能先回到待审核
  if (
    body.status === 'published' &&
    (existing.status === 'unpublished' || existing.status === 'rejected')
  ) {
    return c.json({ error: 'resubmit_required' }, 400)
  }
  if (body.status === 'pending') {
    if (existing.status !== 'unpublished' && existing.status !== 'rejected') {
      return c.json({ error: 'invalid_status' }, 400)
    }
  }
  if (body.status === 'published') {
    if (existing.status !== 'pending') {
      return c.json({ error: 'invalid_status' }, 400)
    }
    const hasFile = await headOriginal(c.env.R2, id)
    if (c.env.R2) {
      if (!hasFile) return c.json({ error: 'original_required' }, 400)
    } else if (!(body.hasOriginal ?? existing.hasOriginal)) {
      return c.json({ error: 'original_required' }, 400)
    }
  }

  const nextHasOriginal =
    body.hasOriginal !== undefined
      ? body.hasOriginal
      : body.status === 'published' || (await headOriginal(c.env.R2, id))
        ? true
        : existing.hasOriginal

  const wp = await updateWallpaper(c.env.KV, id, {
    title: body.title,
    description: body.description,
    previewUrl: body.previewUrl,
    width: body.width,
    height: body.height,
    tierRequired: body.tierRequired,
    categoryId: body.categoryId,
    tagIds: body.tagIds,
    hasOriginal: nextHasOriginal,
    status: body.status,
    rejectReason:
      body.status === 'rejected'
        ? body.rejectReason || existing.rejectReason || '未填写理由'
        : body.status === 'published' || body.status === 'pending'
          ? ''
          : body.rejectReason,
  })
  if (!wp) return c.json({ error: 'not_found' }, 404)

  if (body.status === 'published' || body.status === 'rejected') {
    await safeResolveTodosForWallpaper(c.env.KV, id)
  } else if (body.status === 'pending') {
    await safeUpsertAdminTodo(c.env.KV, {
      type: 'wallpaper_pending',
      wallpaperId: wp.id,
      wallpaperTitle: wp.title,
      createdByAdminId: wp.createdByAdminId,
    })
  }

  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action:
      body.status === 'published'
        ? 'wallpapers.list.approve'
        : body.status === 'rejected'
          ? 'wallpapers.list.reject'
          : body.status === 'unpublished'
            ? 'wallpapers.list.unpublish'
            : body.status === 'pending'
              ? 'wallpapers.list.resubmit'
              : 'wallpapers.list.edit',
    target: `wallpaper:${id}`,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp) })
})

adminWallpapersRoutes.delete('/:id', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.delete')
  if (denied) return denied
  const { admin, scope } = await getActorScope(c)
  const existing = await getWallpaper(c.env.KV, c.req.param('id'))
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)
  if (!assertOwned(scope, admin.id, existing.createdByAdminId)) {
    return c.json({ error: 'forbidden_scope' }, 403)
  }
  const wp = await softDeleteWallpaper(c.env.KV, c.req.param('id'))
  if (!wp) return c.json({ error: 'not_found' }, 404)
  await deleteWallpaperObjects(c.env.R2, wp.id)
  await safeResolveTodosForWallpaper(c.env.KV, wp.id)
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.delete',
    target: `wallpaper:${wp.id}`,
  })
  return c.json({ ok: true })
})
