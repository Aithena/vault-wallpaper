import { isUserMembershipActive, type UserRecord } from './users'

/** Consider online if seen within this window (approximate). */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000

/** 登录即会员；按权益状态区分。 */
export type MemberBenefitStatus = 'never_purchased' | 'active' | 'expired'

export type PresenceRecord = {
  userId: string
  email: string
  memberTier: string | null
  /** @deprecated use benefitStatus */
  membershipActive: boolean
  benefitStatus: MemberBenefitStatus
  path?: string
  lastSeenAt: string
}

const INDEX_KEY = 'presence:index'
const MAX_INDEX = 500

function presenceKey(userId: string) {
  return `presence:${userId}`
}

export function resolveMemberBenefitStatus(user: UserRecord): MemberBenefitStatus {
  if (isUserMembershipActive(user)) return 'active'
  if (user.memberExpiresAt || user.memberTier || user.memberStatus) return 'expired'
  return 'never_purchased'
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

/** Min interval between presence KV writes when path/membership unchanged. */
const PRESENCE_WRITE_MIN_MS = 3 * 60 * 1000

export async function touchPresence(
  kv: KVNamespace,
  user: UserRecord,
  path?: string,
): Promise<PresenceRecord> {
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const benefitStatus = resolveMemberBenefitStatus(user)
  const nextPath = path?.slice(0, 200)
  const existingRaw = await kv.get(presenceKey(user.id))
  if (existingRaw) {
    const prev = JSON.parse(existingRaw) as PresenceRecord
    const prevTs = Date.parse(prev.lastSeenAt)
    const samePath = (prev.path || '') === (nextPath || '')
    const sameBenefit = normalizeBenefit(prev) === benefitStatus
    const sameTier = (prev.memberTier || null) === (user.memberTier || null)
    if (
      Number.isFinite(prevTs) &&
      nowMs - prevTs < PRESENCE_WRITE_MIN_MS &&
      samePath &&
      sameBenefit &&
      sameTier
    ) {
      return {
        ...prev,
        benefitStatus,
        membershipActive: benefitStatus === 'active',
      }
    }
  }

  const record: PresenceRecord = {
    userId: user.id,
    email: user.email,
    memberTier: user.memberTier,
    membershipActive: benefitStatus === 'active',
    benefitStatus,
    path: nextPath,
    lastSeenAt: now,
  }
  await kv.put(presenceKey(user.id), JSON.stringify(record))

  // Rewrite index only when the user is absent from it (new or pruned after idle)
  const ids = await readIndex(kv)
  if (!ids.includes(user.id)) {
    await writeIndex(kv, [user.id, ...ids])
  }
  return record
}

export async function clearPresence(kv: KVNamespace, userId: string) {
  await kv.delete(presenceKey(userId))
  const ids = await readIndex(kv)
  if (ids.includes(userId)) {
    await writeIndex(
      kv,
      ids.filter((id) => id !== userId),
    )
  }
}

function normalizeBenefit(row: PresenceRecord): MemberBenefitStatus {
  if (row.benefitStatus) return row.benefitStatus
  return row.membershipActive ? 'active' : 'never_purchased'
}

export async function listOnlinePresence(
  kv: KVNamespace,
  opts?: { benefit?: 'all' | MemberBenefitStatus },
): Promise<PresenceRecord[]> {
  const cutoff = Date.now() - ONLINE_WINDOW_MS
  const benefit = opts?.benefit ?? 'all'
  const ids = await readIndex(kv)
  const rows: PresenceRecord[] = []
  const keep: string[] = []
  const fetched = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.get(presenceKey(id))
      return { id, raw }
    }),
  )
  for (const { id, raw } of fetched) {
    if (!raw) continue
    const row = JSON.parse(raw) as PresenceRecord
    const ts = Date.parse(row.lastSeenAt)
    if (!Number.isFinite(ts) || ts < cutoff) continue
    row.benefitStatus = normalizeBenefit(row)
    row.membershipActive = row.benefitStatus === 'active'
    if (benefit !== 'all' && row.benefitStatus !== benefit) continue
    rows.push(row)
    keep.push(id)
  }
  if (keep.length !== ids.length) {
    await writeIndex(kv, keep)
  }
  rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  return rows
}
