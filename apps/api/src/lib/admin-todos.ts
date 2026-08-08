/** Event-driven admin todos (reminders). */

export type AdminTodoType = 'wallpaper_pending' | 'ai_failed' | 'ai_ready'

export type AdminTodoRecord = {
  id: string
  type: AdminTodoType
  title: string
  description: string
  path: string
  wallpaperId: string
  wallpaperTitle: string
  createdByAdminId?: string
  createdAt: string
  readAt?: string | null
  resolvedAt?: string | null
}

const INDEX_KEY = 'admin_todos:index'
const MAX_INDEX = 2000

function todoKey(id: string) {
  return `admin_todo:${id}`
}

/** Open-todo pointer to avoid full-index scans on upsert. */
function openPointerKey(type: AdminTodoType, wallpaperId: string) {
  return `admin_todo_open:${type}:${wallpaperId}`
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
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
}

async function putTodo(kv: KVNamespace, todo: AdminTodoRecord) {
  await kv.put(todoKey(todo.id), JSON.stringify(todo))
}

export async function getTodo(
  kv: KVNamespace,
  id: string,
): Promise<AdminTodoRecord | null> {
  const raw = await kv.get(todoKey(id))
  return raw ? (JSON.parse(raw) as AdminTodoRecord) : null
}

export async function listTodos(
  kv: KVNamespace,
  limit = 500,
): Promise<AdminTodoRecord[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(todoKey(id))
      return raw ? (JSON.parse(raw) as AdminTodoRecord) : null
    }),
  )
  return rows.filter((r): r is AdminTodoRecord => Boolean(r))
}

/** Count unread open todos without loading full records beyond limit. */
export async function countUnreadTodos(
  kv: KVNamespace,
  opts?: {
    limit?: number
    scope?: 'all' | 'self'
    adminId?: string
  },
): Promise<{ unread: number; pendingType: number }> {
  const limit = opts?.limit ?? 500
  const todos = await listTodos(kv, limit)
  let unread = 0
  let pendingType = 0
  for (const t of todos) {
    if (t.resolvedAt) continue
    if (
      opts?.scope === 'self' &&
      opts.adminId &&
      t.createdByAdminId &&
      t.createdByAdminId !== opts.adminId
    ) {
      continue
    }
    if (t.type === 'wallpaper_pending') pendingType += 1
    if (!t.readAt) unread += 1
  }
  return { unread, pendingType }
}

async function findOpenTodo(
  kv: KVNamespace,
  type: AdminTodoType,
  wallpaperId: string,
): Promise<AdminTodoRecord | null> {
  const pointer = await kv.get(openPointerKey(type, wallpaperId))
  if (pointer) {
    const todo = await getTodo(kv, pointer)
    if (todo && !todo.resolvedAt && todo.type === type && todo.wallpaperId === wallpaperId) {
      return todo
    }
  }
  // Fallback once for legacy rows without pointer
  const all = await listTodos(kv, MAX_INDEX)
  const existing = all.find(
    (t) => !t.resolvedAt && t.type === type && t.wallpaperId === wallpaperId,
  )
  if (existing) {
    await kv.put(openPointerKey(type, wallpaperId), existing.id)
  }
  return existing ?? null
}

async function resolveMatching(
  kv: KVNamespace,
  pred: (t: AdminTodoRecord) => boolean,
): Promise<void> {
  const all = await listTodos(kv, MAX_INDEX)
  const now = new Date().toISOString()
  for (const t of all) {
    if (t.resolvedAt) continue
    if (!pred(t)) continue
    t.resolvedAt = now
    await putTodo(kv, t)
    await kv.delete(openPointerKey(t.type, t.wallpaperId))
  }
}

/**
 * Create a todo. Dedupes open todos of same type+wallpaperId.
 * @param bumpUnread when true (default), clears readAt so it shows again.
 */
export async function upsertAdminTodo(
  kv: KVNamespace,
  input: {
    type: AdminTodoType
    wallpaperId: string
    wallpaperTitle: string
    createdByAdminId?: string
    title?: string
    description?: string
    path?: string
  },
  opts?: { bumpUnread?: boolean },
): Promise<AdminTodoRecord> {
  const bumpUnread = opts?.bumpUnread !== false
  const title = input.wallpaperTitle.trim() || input.wallpaperId
  const defaults: Record<
    AdminTodoType,
    { title: string; description: string; path: string }
  > = {
    wallpaper_pending: {
      title: `待审核：${title}`,
      description: '入库后需人工审核通过才会上架',
      path: `/wallpapers/${input.wallpaperId}`,
    },
    ai_failed: {
      title: `AI 识别失败：${title}`,
      description: '请补传预览或重新识别',
      path: `/wallpapers/${input.wallpaperId}`,
    },
    ai_ready: {
      title: `AI 建议待确认：${title}`,
      description: '打开审核确认页采用描述与分类标签',
      path: `/wallpapers/${input.wallpaperId}`,
    },
  }
  const d = defaults[input.type]

  const existing = await findOpenTodo(kv, input.type, input.wallpaperId)

  const now = new Date().toISOString()
  if (existing) {
    const nextTitle = input.title || d.title
    const nextDesc = input.description || d.description
    const nextPath = input.path || d.path
    const nextCreatedBy = input.createdByAdminId ?? existing.createdByAdminId
    const nextReadAt = bumpUnread ? null : existing.readAt
    const nextCreatedAt = bumpUnread ? now : existing.createdAt

    const unchanged =
      existing.title === nextTitle &&
      existing.description === nextDesc &&
      existing.path === nextPath &&
      existing.wallpaperTitle === title &&
      existing.createdByAdminId === nextCreatedBy &&
      (existing.readAt ?? null) === (nextReadAt ?? null) &&
      existing.createdAt === nextCreatedAt

    if (unchanged) return existing

    const next: AdminTodoRecord = {
      ...existing,
      title: nextTitle,
      description: nextDesc,
      path: nextPath,
      wallpaperTitle: title,
      createdByAdminId: nextCreatedBy,
      readAt: nextReadAt,
      createdAt: nextCreatedAt,
    }
    await putTodo(kv, next)
    if (bumpUnread) {
      const ids = (await readIndex(kv)).filter((id) => id !== existing.id)
      ids.unshift(existing.id)
      await writeIndex(kv, ids)
    }
    return next
  }

  const record: AdminTodoRecord = {
    id: crypto.randomUUID(),
    type: input.type,
    title: input.title || d.title,
    description: input.description || d.description,
    path: input.path || d.path,
    wallpaperId: input.wallpaperId,
    wallpaperTitle: title,
    createdByAdminId: input.createdByAdminId,
    createdAt: now,
    readAt: null,
    resolvedAt: null,
  }
  await putTodo(kv, record)
  await kv.put(openPointerKey(input.type, input.wallpaperId), record.id)
  const ids = await readIndex(kv)
  ids.unshift(record.id)
  await writeIndex(kv, ids)
  return record
}

/** Create only if no open todo of this type exists (does not bump unread). */
export async function ensureAdminTodo(
  kv: KVNamespace,
  input: Parameters<typeof upsertAdminTodo>[1],
): Promise<AdminTodoRecord> {
  return upsertAdminTodo(kv, input, { bumpUnread: false })
}

export async function markTodoRead(
  kv: KVNamespace,
  id: string,
): Promise<AdminTodoRecord | null> {
  const todo = await getTodo(kv, id)
  if (!todo || todo.resolvedAt) return todo
  if (todo.readAt) return todo
  todo.readAt = new Date().toISOString()
  await putTodo(kv, todo)
  return todo
}

/** Resolve all open todos for a wallpaper (approve / reject / delete). */
export async function resolveTodosForWallpaper(
  kv: KVNamespace,
  wallpaperId: string,
): Promise<void> {
  await resolveMatching(kv, (t) => t.wallpaperId === wallpaperId)
}

/** When AI finishes, close the other AI state todo for that wallpaper. */
export async function resolveAiTodosForWallpaper(
  kv: KVNamespace,
  wallpaperId: string,
  keepType?: AdminTodoType,
): Promise<void> {
  await resolveMatching(
    kv,
    (t) =>
      t.wallpaperId === wallpaperId &&
      (t.type === 'ai_failed' || t.type === 'ai_ready') &&
      t.type !== keepType,
  )
}

export async function safeUpsertAdminTodo(
  kv: KVNamespace | undefined,
  input: Parameters<typeof upsertAdminTodo>[1],
): Promise<void> {
  if (!kv) return
  try {
    await upsertAdminTodo(kv, input)
  } catch {
    /* todos must not break business flow */
  }
}

export async function safeResolveTodosForWallpaper(
  kv: KVNamespace | undefined,
  wallpaperId: string,
): Promise<void> {
  if (!kv) return
  try {
    await resolveTodosForWallpaper(kv, wallpaperId)
  } catch {
    /* ignore */
  }
}
