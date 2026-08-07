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
  /** C 端账号：active | disabled */
  accountStatus?: 'active' | 'disabled'
  blacklisted?: boolean
}

function userKey(id: string) {
  return `user:${id}`
}

function emailKey(email: string) {
  return `user_email:${email.toLowerCase()}`
}

function normalizeUser(user: UserRecord): UserRecord {
  if (user.memberExpiresAt === undefined) user.memberExpiresAt = null
  if (!user.accountStatus) user.accountStatus = 'active'
  if (user.blacklisted === undefined) user.blacklisted = false
  return user
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
      return normalizeUser(JSON.parse(raw) as UserRecord)
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
    accountStatus: 'active',
    blacklisted: false,
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
  const user = normalizeUser(JSON.parse(raw) as UserRecord)

  // Migrate legacy lifetime members: grant 1 year from now once
  if (user.memberStatus === 'active' && !user.memberExpiresAt) {
    user.memberExpiresAt = new Date(
      Date.now() + MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    await kv.put(userKey(id), JSON.stringify(user))
  }

  return user
}

export async function getUserByEmail(
  kv: KVNamespace,
  email: string,
): Promise<UserRecord | null> {
  const id = await kv.get(emailKey(email.toLowerCase()))
  if (!id) return null
  return getUser(kv, id)
}

export async function listUsers(kv: KVNamespace): Promise<UserRecord[]> {
  const rows: UserRecord[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: 'user:', cursor, limit: 1000 })
    for (const key of page.keys) {
      // skip malformed; only user:{uuid}
      if (!/^user:[0-9a-f-]{36}$/i.test(key.name)) continue
      const raw = await kv.get(key.name)
      if (raw) rows.push(normalizeUser(JSON.parse(raw) as UserRecord))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return rows
}

export async function updateUserAdmin(
  kv: KVNamespace,
  id: string,
  patch: {
    accountStatus?: 'active' | 'disabled'
    blacklisted?: boolean
    memberTier?: MembershipTierId | null
    memberStatus?: MemberStatus | null
    memberExpiresAt?: string | null
  },
): Promise<UserRecord | null> {
  const user = await getUser(kv, id)
  if (!user) return null
  if (patch.accountStatus !== undefined) user.accountStatus = patch.accountStatus
  if (patch.blacklisted !== undefined) user.blacklisted = patch.blacklisted
  if (patch.memberTier !== undefined) user.memberTier = patch.memberTier
  if (patch.memberStatus !== undefined) user.memberStatus = patch.memberStatus
  if (patch.memberExpiresAt !== undefined) user.memberExpiresAt = patch.memberExpiresAt
  await kv.put(userKey(id), JSON.stringify(user))
  return user
}

export function isUserMembershipActive(user: UserRecord): boolean {
  if (user.accountStatus === 'disabled') return false
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
