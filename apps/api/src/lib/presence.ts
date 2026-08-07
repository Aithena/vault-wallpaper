import { isUserMembershipActive, type UserRecord } from './users'

/** Consider online if seen within this window (approximate). */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000

export type PresenceRecord = {
  userId: string
  email: string
  memberTier: string | null
  membershipActive: boolean
  path?: string
  lastSeenAt: string
}

const INDEX_KEY = 'presence:index'
const MAX_INDEX = 500

function presenceKey(userId: string) {
  return `presence:${userId}`
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

export async function touchPresence(
  kv: KVNamespace,
  user: UserRecord,
  path?: string,
): Promise<PresenceRecord> {
  const now = new Date().toISOString()
  const record: PresenceRecord = {
    userId: user.id,
    email: user.email,
    memberTier: user.memberTier,
    membershipActive: isUserMembershipActive(user),
    path: path?.slice(0, 200),
    lastSeenAt: now,
  }
  await kv.put(presenceKey(user.id), JSON.stringify(record))
  const ids = await readIndex(kv)
  const next = [user.id, ...ids.filter((id) => id !== user.id)]
  await writeIndex(kv, next)
  return record
}

export async function clearPresence(kv: KVNamespace, userId: string) {
  await kv.delete(presenceKey(userId))
  const ids = await readIndex(kv)
  await writeIndex(
    kv,
    ids.filter((id) => id !== userId),
  )
}

export async function listOnlinePresence(
  kv: KVNamespace,
  opts?: { membersOnly?: boolean },
): Promise<PresenceRecord[]> {
  const cutoff = Date.now() - ONLINE_WINDOW_MS
  const ids = await readIndex(kv)
  const rows: PresenceRecord[] = []
  const keep: string[] = []
  for (const id of ids) {
    const raw = await kv.get(presenceKey(id))
    if (!raw) continue
    const row = JSON.parse(raw) as PresenceRecord
    const ts = Date.parse(row.lastSeenAt)
    if (!Number.isFinite(ts) || ts < cutoff) continue
    if (opts?.membersOnly && !row.membershipActive) continue
    rows.push(row)
    keep.push(id)
  }
  // opportunistic prune of stale index entries
  if (keep.length !== ids.length) {
    await writeIndex(kv, keep)
  }
  rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  return rows
}
