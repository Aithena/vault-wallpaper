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

const INDEX_KEY = 'users:index'
const INDEX_BUILT_FLAG = 'users:index_built_v1'
const MAX_INDEX = 10000

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

async function ensureUsersIndex(kv: KVNamespace): Promise<string[]> {
  const built = await kv.get(INDEX_BUILT_FLAG)
  if (built) return readIndex(kv)

  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: 'user:', cursor, limit: 1000 })
    for (const key of page.keys) {
      if (!/^user:[0-9a-f-]{36}$/i.test(key.name)) continue
      ids.push(key.name.slice('user:'.length))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  await writeIndex(kv, ids)
  await kv.put(INDEX_BUILT_FLAG, '1')
  return ids
}

async function addUserToIndex(kv: KVNamespace, id: string) {
  const ids = await ensureUsersIndex(kv)
  if (!ids.includes(id)) {
    ids.unshift(id)
    await writeIndex(kv, ids)
  }
}

function isPaidMember(user: UserRecord): boolean {
  return (
    isUserMembershipActive(user) &&
    Boolean(user.memberTier) &&
    user.memberTier !== 'free'
  )
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
  await addUserToIndex(kv, id)
  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      s.usersTotal += 1
    })
  } catch {
    /* ignore */
  }
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
  const ids = await ensureUsersIndex(kv)
  const rows = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await kv.get(userKey(id))
        return raw ? normalizeUser(JSON.parse(raw) as UserRecord) : null
      }),
    )
  ).filter((r): r is UserRecord => Boolean(r))
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
  const beforePaid = isPaidMember(user)
  const beforeDisabled = user.accountStatus === 'disabled'
  const beforeBl = Boolean(user.blacklisted)

  if (patch.accountStatus !== undefined) user.accountStatus = patch.accountStatus
  if (patch.blacklisted !== undefined) user.blacklisted = patch.blacklisted
  if (patch.memberTier !== undefined) user.memberTier = patch.memberTier
  if (patch.memberStatus !== undefined) user.memberStatus = patch.memberStatus
  if (patch.memberExpiresAt !== undefined) user.memberExpiresAt = patch.memberExpiresAt
  await kv.put(userKey(id), JSON.stringify(user))

  const afterPaid = isPaidMember(user)
  const afterDisabled = user.accountStatus === 'disabled'
  const afterBl = Boolean(user.blacklisted)
  try {
    const { patchDashboardStats } = await import('./dashboard-stats')
    await patchDashboardStats(kv, (s) => {
      if (!beforeDisabled && afterDisabled) s.usersDisabled += 1
      if (beforeDisabled && !afterDisabled)
        s.usersDisabled = Math.max(0, s.usersDisabled - 1)
      if (!beforeBl && afterBl) s.usersBlacklisted += 1
      if (beforeBl && !afterBl)
        s.usersBlacklisted = Math.max(0, s.usersBlacklisted - 1)
      if (!beforePaid && afterPaid) s.paidMembers += 1
      if (beforePaid && !afterPaid)
        s.paidMembers = Math.max(0, s.paidMembers - 1)
    })
  } catch {
    /* ignore */
  }

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
  const beforePaid = isPaidMember(user)

  const now = Date.now()
  const currentExp = user.memberExpiresAt ? Date.parse(user.memberExpiresAt) : 0
  const base = currentExp > now ? currentExp : now
  const expiresAt = new Date(base + MEMBERSHIP_DAYS * 24 * 60 * 60 * 1000)

  user.memberTier = tier
  user.memberStatus = 'active'
  user.memberExpiresAt = expiresAt.toISOString()
  if (!user.memberSince) user.memberSince = new Date(now).toISOString()

  await kv.put(userKey(userId), JSON.stringify(user))
  const afterPaid = isPaidMember(user)
  if (!beforePaid && afterPaid) {
    try {
      const { patchDashboardStats } = await import('./dashboard-stats')
      await patchDashboardStats(kv, (s) => {
        s.paidMembers += 1
      })
    } catch {
      /* ignore */
    }
  }
  return user
}

/** Mark membership inactive (e.g. after refund). Keeps history fields. */
export async function revokeMembership(
  kv: KVNamespace,
  userId: string,
): Promise<UserRecord | null> {
  const user = await getUser(kv, userId)
  if (!user) return null
  const beforePaid = isPaidMember(user)
  user.memberStatus = 'disabled'
  user.memberExpiresAt = new Date().toISOString()
  await kv.put(userKey(userId), JSON.stringify(user))
  if (beforePaid) {
    try {
      const { patchDashboardStats } = await import('./dashboard-stats')
      await patchDashboardStats(kv, (s) => {
        s.paidMembers = Math.max(0, s.paidMembers - 1)
      })
    } catch {
      /* ignore */
    }
  }
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
