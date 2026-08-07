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
import {
  headOriginal,
  previewApiPath,
  putOriginal,
  putPreview,
} from '../lib/r2-wallpaper'

export const adminWallpapersRoutes = new Hono<AppEnv>()
adminWallpapersRoutes.use('*', requireAdmin)

function asUploadFile(value: unknown): File | null {
  if (value instanceof File && value.size > 0) return value
  return null
}

async function loadMaps(kv: KVNamespace) {
  await ensureSeedCatalog(kv)
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
  const { wallpapers, catMap, tagMap } = await loadMaps(c.env.KV)
  return c.json({
    wallpapers: wallpapers.map((w) => mapWallpaper(w, catMap, tagMap)),
  })
})

adminWallpapersRoutes.get('/taxonomy', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.list')
  if (denied) return denied
  const { wallpapers, categories, tags } = await loadMaps(c.env.KV)
  return c.json({
    categories: categories.map((cat) => ({
      ...cat,
      wallpaperCount: wallpapers.filter((w) => w.categoryId === cat.id).length,
    })),
    tags: tags.map((tag) => ({
      ...tag,
      wallpaperCount: wallpapers.filter((w) => w.tagIds.includes(tag.id)).length,
    })),
  })
})

adminWallpapersRoutes.get('/categories', async (c) => {
  const denied = await requireMenu(c, 'wallpapers.categories')
  if (denied) return denied
  const { wallpapers, categories } = await loadMaps(c.env.KV)
  return c.json({
    categories: categories.map((cat) => ({
      ...cat,
      wallpaperCount: wallpapers.filter((w) => w.categoryId === cat.id).length,
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
  const category = await createCategory(c.env.KV, {
    name: body.name,
    slug: body.slug,
    sort: body.sort,
  })
  const admin = c.get('admin')!
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
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
    sort?: number
  }
  const category = await updateCategory(c.env.KV, c.req.param('id'), body)
  if (!category) return c.json({ error: 'not_found' }, 404)
  const admin = c.get('admin')!
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
  const result = await deleteCategory(c.env.KV, c.req.param('id'))
  if (!result.ok) return c.json({ error: result.error }, 400)
  const admin = c.get('admin')!
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
  const { wallpapers, tags } = await loadMaps(c.env.KV)
  return c.json({
    tags: tags.map((tag) => ({
      ...tag,
      wallpaperCount: wallpapers.filter((w) => w.tagIds.includes(tag.id)).length,
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
  const tag = await createTag(c.env.KV, { name: body.name, slug: body.slug })
  const admin = c.get('admin')!
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
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    slug?: string
  }
  const tag = await updateTag(c.env.KV, c.req.param('id'), body)
  if (!tag) return c.json({ error: 'not_found' }, 404)
  const admin = c.get('admin')!
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
  const result = await deleteTag(c.env.KV, c.req.param('id'))
  if (!result.ok) return c.json({ error: result.error }, 400)
  const admin = c.get('admin')!
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
    id?: string
    title?: string
    previewUrl?: string
    width?: number
    height?: number
    tierRequired?: string
    categoryId?: string | null
    tagIds?: string[]
    hasOriginal?: boolean
  }
  if (!body.id?.trim() || !body.title?.trim() || !body.tierRequired) {
    return c.json({ error: 'invalid_payload' }, 400)
  }
  if (!isMembershipTierId(body.tierRequired)) {
    return c.json({ error: 'invalid_tier' }, 400)
  }
  await ensureSeedCatalog(c.env.KV)
  const existing = await getWallpaper(c.env.KV, body.id.trim())
  if (existing && !existing.deletedAt) {
    return c.json({ error: 'id_exists' }, 409)
  }
  const id = body.id.trim()
  const hasOriginal =
    Boolean(body.hasOriginal) || (await headOriginal(c.env.R2, id))
  const admin = c.get('admin')!
  const wp = await createWallpaper(c.env.KV, {
    id,
    title: body.title,
    previewUrl: body.previewUrl || '',
    width: body.width || 3840,
    height: body.height || 2160,
    tierRequired: body.tierRequired as MembershipTierId,
    categoryId: body.categoryId ?? null,
    tagIds: body.tagIds ?? [],
    hasOriginal,
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
    action?: 'approve' | 'unpublish' | 'delete'
    ids?: string[]
  }
  if (!body.action || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'invalid_payload' }, 400)
  }

  await ensureSeedCatalog(c.env.KV)
  const admin = c.get('admin')!
  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const id of body.ids) {
    const existing = await getWallpaper(c.env.KV, id)
    if (!existing || existing.deletedAt) {
      results.push({ id, ok: false, error: 'not_found' })
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
        rejectReason: undefined,
      })
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
  const { catMap, tagMap } = await loadMaps(c.env.KV)
  const wp = await getWallpaper(c.env.KV, c.req.param('id'))
  if (!wp || wp.deletedAt) return c.json({ error: 'not_found' }, 404)
  return c.json({ wallpaper: mapWallpaper(wp, catMap, tagMap) })
})

adminWallpapersRoutes.post('/:id/original', async (c) => {
  const denied = await requireButton(c, 'wallpapers.list.upload')
  if (denied) return denied
  if (!c.env.R2) return c.json({ error: 'r2_unavailable' }, 503)

  const id = c.req.param('id')
  await ensureSeedCatalog(c.env.KV)
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)

  const form = await c.req.parseBody({ all: true })
  const file = asUploadFile(form.file)
  if (!file) return c.json({ error: 'file_required' }, 400)

  await putOriginal(c.env.R2, id, await file.arrayBuffer(), file.type || 'image/jpeg')
  const wp = await updateWallpaper(c.env.KV, id, { hasOriginal: true })
  const admin = c.get('admin')!
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
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)

  const form = await c.req.parseBody({ all: true })
  const file = asUploadFile(form.file)
  if (!file) return c.json({ error: 'file_required' }, 400)

  await putPreview(c.env.R2, id, await file.arrayBuffer(), file.type || 'image/jpeg')
  const previewUrl = previewApiPath(id)
  const wp = await updateWallpaper(c.env.KV, id, { previewUrl })
  const admin = c.get('admin')!
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.upload_preview',
    target: `wallpaper:${id}`,
    detail: file.name,
  })
  return c.json({ ok: true, wallpaper: toPublicWallpaper(wp!), previewUrl })
})

adminWallpapersRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
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
  const existing = await getWallpaper(c.env.KV, id)
  if (!existing || existing.deletedAt) return c.json({ error: 'not_found' }, 404)

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

  const admin = c.get('admin')!
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
  const wp = await softDeleteWallpaper(c.env.KV, c.req.param('id'))
  if (!wp) return c.json({ error: 'not_found' }, 404)
  const admin = c.get('admin')!
  await writeAudit(c.env.KV, {
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'wallpapers.list.delete',
    target: `wallpaper:${wp.id}`,
  })
  return c.json({ ok: true })
})
