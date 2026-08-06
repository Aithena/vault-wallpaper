import type { MembershipTierId, MemberStatus } from '@vault/shared'

export type UserRecord = {
  id: string
  email: string
  createdAt: string
  memberTier: MembershipTierId | null
  memberStatus: MemberStatus | null
  memberSince: string | null
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
    if (raw) return JSON.parse(raw) as UserRecord
  }

  const id = crypto.randomUUID()
  const user: UserRecord = {
    id,
    email: normalized,
    createdAt: new Date().toISOString(),
    memberTier: null,
    memberStatus: null,
    memberSince: null,
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
  return raw ? (JSON.parse(raw) as UserRecord) : null
}

export async function activateMembership(
  kv: KVNamespace,
  userId: string,
  tier: MembershipTierId,
): Promise<UserRecord | null> {
  const user = await getUser(kv, userId)
  if (!user) return null
  user.memberTier = tier
  user.memberStatus = 'active'
  user.memberSince = new Date().toISOString()
  await kv.put(userKey(userId), JSON.stringify(user))
  return user
}
