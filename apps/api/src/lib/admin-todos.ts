/** Event-driven admin todos (reminders). Badge still uses live pending counts. */

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
  const rows: AdminTodoRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(todoKey(id))
    if (raw) rows.push(JSON.parse(raw) as AdminTodoRecord)
  }
  return rows
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

  const all = await listTodos(kv, MAX_INDEX)
  const existing = all.find(
    (t) =>
      !t.resolvedAt &&
      t.type === input.type &&
      t.wallpaperId === input.wallpaperId,
  )

  const now = new Date().toISOString()
  if (existing) {
    const next: AdminTodoRecord = {
      ...existing,
      title: input.title || d.title,
      description: input.description || d.description,
      path: input.path || d.path,
      wallpaperTitle: title,
      createdByAdminId: input.createdByAdminId ?? existing.createdByAdminId,
      readAt: bumpUnread ? null : existing.readAt,
      createdAt: bumpUnread ? now : existing.createdAt,
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
