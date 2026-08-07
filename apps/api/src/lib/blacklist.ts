import { getUser, getUserByEmail, updateUserAdmin, type UserRecord } from './users'

export type BlacklistRecord = {
  userId: string
  email: string
  reason: string
  operatorId: string
  operator: string
  createdAt: string
}

const INDEX_KEY = 'blacklists:index'

function blKey(userId: string) {
  return `blacklist:${userId}`
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

export async function listBlacklist(kv: KVNamespace): Promise<BlacklistRecord[]> {
  const ids = await readIndex(kv)
  const rows: BlacklistRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(blKey(id))
    if (raw) rows.push(JSON.parse(raw) as BlacklistRecord)
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return rows
}

export async function getBlacklistEntry(
  kv: KVNamespace,
  userId: string,
): Promise<BlacklistRecord | null> {
  const raw = await kv.get(blKey(userId))
  return raw ? (JSON.parse(raw) as BlacklistRecord) : null
}

export async function addToBlacklist(
  kv: KVNamespace,
  input: {
    email: string
    reason?: string
    operatorId: string
    operator: string
  },
): Promise<
  | { ok: true; entry: BlacklistRecord; user: UserRecord }
  | { ok: false; error: string }
> {
  const email = input.email.trim().toLowerCase()
  if (!email) return { ok: false, error: 'invalid_email' }

  let user = await getUserByEmail(kv, email)
  if (!user) {
    // Allow blacklisting known emails that haven't registered? Prefer require existing user.
    return { ok: false, error: 'user_not_found' }
  }

  if (user.blacklisted) {
    const existing = await getBlacklistEntry(kv, user.id)
    if (existing) return { ok: true, entry: existing, user }
  }

  const entry: BlacklistRecord = {
    userId: user.id,
    email: user.email,
    reason: input.reason?.trim() || '未填写原因',
    operatorId: input.operatorId,
    operator: input.operator,
    createdAt: new Date().toISOString(),
  }
  await kv.put(blKey(user.id), JSON.stringify(entry))
  const ids = await readIndex(kv)
  if (!ids.includes(user.id)) {
    ids.unshift(user.id)
    await writeIndex(kv, ids)
  }
  const updated = await updateUserAdmin(kv, user.id, { blacklisted: true })
  return { ok: true, entry, user: updated! }
}

export async function removeFromBlacklist(
  kv: KVNamespace,
  userId: string,
): Promise<{ ok: true; user: UserRecord } | { ok: false; error: string }> {
  const user = await getUser(kv, userId)
  if (!user) return { ok: false, error: 'not_found' }

  await kv.delete(blKey(userId))
  await writeIndex(
    kv,
    (await readIndex(kv)).filter((id) => id !== userId),
  )
  const updated = await updateUserAdmin(kv, userId, { blacklisted: false })
  return { ok: true, user: updated! }
}
