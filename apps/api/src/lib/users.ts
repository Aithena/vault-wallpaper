import {
  MEMBERSHIP_DAYS,
  type MembershipTierId,
  type MemberStatus,
} from '@vault/shared'

export type UserRecord = {
  id: string
  email: string
  createdAt: string
  memberTier: MembershipTierId | null
  memberStatus: MemberStatus | null
  memberSince: string | null
  memberExpiresAt: string | null
}

function userKey(id: string) {
  return `user:${id}`
}

function emailKey(email: string) {
  return `user_email:${email.toLowerCase()}`
}

export async function findOrCreateUserByEmail(
  kv: KVNamespace,
  email: string,
): Promise<UserRecord> {
  const normalized = email.toLowerCase()
  const existingId = await kv.get(emailKey(normalized))
  if (existingId) {
    const raw = await kv.get(userKey(existingId))
    if (raw) {
      const user = JSON.parse(raw) as UserRecord
      if (user.memberExpiresAt === undefined) user.memberExpiresAt = null
      return user
    }
  }

  const id = crypto.randomUUID()
  const user: UserRecord = {
    id,
    email: normalized,
    createdAt: new Date().toISOString(),
    memberTier: null,
    memberStatus: null,
    memberSince: null,
    memberExpiresAt: null,
  }
  await kv.put(userKey(id), JSON.stringify(user))
  await kv.put(emailKey(normalized), id)
  return user
}

export async function getUser(
  kv: KVNamespace,
  id: string,
): Promise<UserRecord | null> {
  const raw = await kv.get(userKey(id))
  if (!raw) return null
  const user = JSON.parse(raw) as UserRecord
  if (user.memberExpiresAt === undefined) user.memberExpiresAt = null

  // Migrate legacy lifetime members: grant 1 year from now once
  if (user.memberStatus === 'active' && !user.memberExpiresAt) {
    user.memberExpiresAt = new Date(
      Date.now() + MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    await kv.put(userKey(id), JSON.stringify(user))
  }

  return user
}

export function isUserMembershipActive(user: UserRecord): boolean {
  if (user.memberStatus !== 'active' || !user.memberExpiresAt) return false
  const exp = Date.parse(user.memberExpiresAt)
  return Number.isFinite(exp) && exp > Date.now()
}

/** Activate or renew: add MEMBERSHIP_DAYS from now, or from current expiry if still valid. */
export async function activateMembership(
  kv: KVNamespace,
  userId: string,
  tier: MembershipTierId,
): Promise<UserRecord | null> {
  const user = await getUser(kv, userId)
  if (!user) return null

  const now = Date.now()
  const currentExp = user.memberExpiresAt ? Date.parse(user.memberExpiresAt) : 0
  const base = currentExp > now ? currentExp : now
  const expiresAt = new Date(base + MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000)

  user.memberTier = tier
  user.memberStatus = 'active'
  user.memberExpiresAt = expiresAt.toISOString()
  if (!user.memberSince) user.memberSince = new Date(now).toISOString()

  await kv.put(userKey(userId), JSON.stringify(user))
  return user
}

export function toSessionUser(user: UserRecord) {
  const active = isUserMembershipActive(user)
  return {
    id: user.id,
    email: user.email,
    memberTier: active ? user.memberTier : null,
    memberStatus: active ? ('active' as const) : null,
    memberExpiresAt: user.memberExpiresAt,
  }
}
