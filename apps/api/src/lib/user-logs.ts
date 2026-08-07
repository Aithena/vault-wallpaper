export type UserLogActor = 'admin' | 'system' | 'user'

export type UserLogRecord = {
  id: string
  userId: string
  at: string
  action: string
  detail?: string
  actorType: UserLogActor
  actorId?: string
  actorName?: string
}

const MAX_INDEX = 200

function indexKey(userId: string) {
  return `user_logs:${userId}`
}

function logKey(userId: string, id: string) {
  return `user_log:${userId}:${id}`
}

async function readIndex(kv: KVNamespace, userId: string): Promise<string[]> {
  const raw = await kv.get(indexKey(userId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function writeUserLog(
  kv: KVNamespace,
  input: {
    userId: string
    action: string
    detail?: string
    actorType: UserLogActor
    actorId?: string
    actorName?: string
  },
): Promise<UserLogRecord> {
  const id = crypto.randomUUID()
  const record: UserLogRecord = {
    id,
    userId: input.userId,
    at: new Date().toISOString(),
    action: input.action,
    detail: input.detail,
    actorType: input.actorType,
    actorId: input.actorId,
    actorName: input.actorName,
  }
  await kv.put(logKey(input.userId, id), JSON.stringify(record))
  const ids = await readIndex(kv, input.userId)
  ids.unshift(id)
  await kv.put(indexKey(input.userId), JSON.stringify(ids.slice(0, MAX_INDEX)))
  return record
}

export async function listUserLogs(
  kv: KVNamespace,
  userId: string,
  limit = 100,
): Promise<UserLogRecord[]> {
  const ids = (await readIndex(kv, userId)).slice(0, limit)
  const rows: UserLogRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(logKey(userId, id))
    if (raw) rows.push(JSON.parse(raw) as UserLogRecord)
  }
  return rows
}
