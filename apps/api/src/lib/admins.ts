import {
  SYSTEM_ROLE_OPS_ID,
  SYSTEM_ROLE_SUPER_ID,
  type AdminDataScopeOverride,
  type AdminPublic,
  type AdminStatus,
  type DataScope,
} from '@vault/shared'
import { hashPassword, verifyPassword } from './password'
import { ensureDefaultRoles, getRole, type RoleRecord } from './roles'

export type AdminRecord = {
  id: string
  username: string
  passwordHash: string
  name: string
  email: string | null
  roleId: string
  dataScope: AdminDataScopeOverride
  status: AdminStatus
  createdAt: string
  updatedAt: string
  /** 旧字段，读取时迁移 */
  role?: 'super' | 'ops'
}

const INDEX_KEY = 'admins:index'

function adminKey(id: string) {
  return `admin:${id}`
}

function usernameKey(username: string) {
  return `admin_username:${username.trim().toLowerCase()}`
}

function emailKey(email: string) {
  return `admin_email:${email.trim().toLowerCase()}`
}

function migrateAdmin(raw: AdminRecord): AdminRecord {
  if (raw.roleId) {
    if (!raw.dataScope) raw.dataScope = 'follow_role'
    return raw
  }
  const legacy = raw.role === 'ops' ? SYSTEM_ROLE_OPS_ID : SYSTEM_ROLE_SUPER_ID
  raw.roleId = legacy
  raw.dataScope = raw.dataScope ?? 'follow_role'
  delete raw.role
  return raw
}

export function resolveEffectiveDataScope(
  admin: AdminRecord,
  role: RoleRecord | null,
): DataScope {
  if (admin.dataScope === 'all' || admin.dataScope === 'self') {
    return admin.dataScope
  }
  return role?.dataScope === 'self' ? 'self' : 'all'
}

export function toAdminPublic(
  admin: AdminRecord,
  role: RoleRecord | null,
  withPerms = false,
): AdminPublic {
  const effectiveDataScope = resolveEffectiveDataScope(admin, role)
  const base: AdminPublic = {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    email: admin.email,
    roleId: admin.roleId,
    roleName: role?.name ?? '—',
    roleCode: role?.code ?? '—',
    dataScope: admin.dataScope,
    status: admin.status,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  }
  if (withPerms && role) {
    base.menus = role.menus
    base.buttons = role.buttons
    base.effectiveDataScope = effectiveDataScope
  }
  return base
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

export async function getAdmin(
  kv: KVNamespace,
  id: string,
): Promise<AdminRecord | null> {
  const raw = await kv.get(adminKey(id))
  if (!raw) return null
  const admin = migrateAdmin(JSON.parse(raw) as AdminRecord)
  // persist migration lazily
  if (!(JSON.parse(raw) as AdminRecord).roleId) {
    await putAdmin(kv, admin)
  }
  return admin
}

export async function findAdminByUsername(
  kv: KVNamespace,
  username: string,
): Promise<AdminRecord | null> {
  const id = await kv.get(usernameKey(username))
  if (!id) return null
  return getAdmin(kv, id)
}

export async function findAdminByEmail(
  kv: KVNamespace,
  email: string,
): Promise<AdminRecord | null> {
  const id = await kv.get(emailKey(email))
  if (!id) return null
  return getAdmin(kv, id)
}

export async function listAdmins(kv: KVNamespace): Promise<AdminRecord[]> {
  const ids = await readIndex(kv)
  const rows: AdminRecord[] = []
  for (const id of ids) {
    const admin = await getAdmin(kv, id)
    if (admin) rows.push(admin)
  }
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return rows
}

export async function countAdminsByRole(
  kv: KVNamespace,
  roleId: string,
): Promise<number> {
  const all = await listAdmins(kv)
  return all.filter((a) => a.roleId === roleId).length
}

async function putAdmin(kv: KVNamespace, admin: AdminRecord) {
  const { role: _legacy, ...rest } = admin
  await kv.put(adminKey(admin.id), JSON.stringify(rest))
}

export async function ensureDefaultAdmin(kv: KVNamespace): Promise<void> {
  await ensureDefaultRoles(kv)
  const ids = await readIndex(kv)
  if (ids.length > 0) {
    // migrate existing rows
    for (const id of ids) {
      await getAdmin(kv, id)
    }
    return
  }

  const existing = await findAdminByUsername(kv, 'admin')
  if (existing) {
    await writeIndex(kv, [existing.id])
    return
  }

  const now = new Date().toISOString()
  const admin: AdminRecord = {
    id: crypto.randomUUID(),
    username: 'admin',
    passwordHash: await hashPassword('admin123'),
    name: '超级管理员',
    email: 'admin@awall.cc',
    roleId: SYSTEM_ROLE_SUPER_ID,
    dataScope: 'follow_role',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  await putAdmin(kv, admin)
  await kv.put(usernameKey(admin.username), admin.id)
  await kv.put(emailKey(admin.email!), admin.id)
  await writeIndex(kv, [admin.id])
}

export async function createAdmin(
  kv: KVNamespace,
  input: {
    username: string
    password: string
    name: string
    email?: string | null
    roleId: string
    dataScope?: AdminDataScopeOverride
  },
): Promise<{ ok: true; admin: AdminRecord } | { ok: false; error: string }> {
  await ensureDefaultRoles(kv)
  const username = input.username.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) {
    return { ok: false, error: 'invalid_username' }
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: 'invalid_password' }
  }
  if (await findAdminByUsername(kv, username)) {
    return { ok: false, error: 'username_taken' }
  }

  const role = await getRole(kv, input.roleId)
  if (!role) return { ok: false, error: 'role_not_found' }

  let email: string | null = input.email?.trim().toLowerCase() || null
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'invalid_email' }
    }
    if (await findAdminByEmail(kv, email)) {
      return { ok: false, error: 'email_taken' }
    }
  }

  const now = new Date().toISOString()
  const admin: AdminRecord = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await hashPassword(input.password),
    name: input.name.trim() || username,
    email,
    roleId: role.id,
    dataScope: input.dataScope ?? 'follow_role',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  await putAdmin(kv, admin)
  await kv.put(usernameKey(username), admin.id)
  if (email) await kv.put(emailKey(email), admin.id)
  const ids = await readIndex(kv)
  ids.push(admin.id)
  await writeIndex(kv, ids)
  return { ok: true, admin }
}

export async function updateAdmin(
  kv: KVNamespace,
  id: string,
  patch: {
    name?: string
    username?: string
    email?: string | null
    roleId?: string
    dataScope?: AdminDataScopeOverride
    status?: AdminStatus
  },
): Promise<{ ok: true; admin: AdminRecord } | { ok: false; error: string }> {
  const admin = await getAdmin(kv, id)
  if (!admin) return { ok: false, error: 'not_found' }

  if (patch.username !== undefined) {
    const next = patch.username.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(next)) {
      return { ok: false, error: 'invalid_username' }
    }
    if (next !== admin.username) {
      const holder = await findAdminByUsername(kv, next)
      if (holder && holder.id !== id) {
        return { ok: false, error: 'username_taken' }
      }
      await kv.delete(usernameKey(admin.username))
      await kv.put(usernameKey(next), id)
      admin.username = next
    }
  }

  if (patch.name !== undefined) {
    admin.name = patch.name.trim() || admin.name
  }

  if (patch.roleId !== undefined) {
    const role = await getRole(kv, patch.roleId)
    if (!role) return { ok: false, error: 'role_not_found' }
    admin.roleId = role.id
  }

  if (patch.dataScope !== undefined) {
    admin.dataScope = patch.dataScope
  }

  if (patch.status !== undefined) {
    if (patch.status === 'disabled' && admin.roleId === SYSTEM_ROLE_SUPER_ID) {
      const all = await listAdmins(kv)
      const activeSupers = all.filter(
        (a) =>
          a.roleId === SYSTEM_ROLE_SUPER_ID &&
          a.status === 'active' &&
          a.id !== id,
      )
      if (activeSupers.length === 0) {
        return { ok: false, error: 'last_super_admin' }
      }
    }
    admin.status = patch.status
  }

  if (patch.email !== undefined) {
    const next = patch.email?.trim().toLowerCase() || null
    if (next && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      return { ok: false, error: 'invalid_email' }
    }
    if (next) {
      const holder = await findAdminByEmail(kv, next)
      if (holder && holder.id !== id) {
        return { ok: false, error: 'email_taken' }
      }
    }
    if (admin.email && admin.email !== next) {
      await kv.delete(emailKey(admin.email))
    }
    if (next) await kv.put(emailKey(next), id)
    admin.email = next
  }

  admin.updatedAt = new Date().toISOString()
  await putAdmin(kv, admin)
  return { ok: true, admin }
}

export async function setAdminPassword(
  kv: KVNamespace,
  id: string,
  password: string,
): Promise<{ ok: true; admin: AdminRecord } | { ok: false; error: string }> {
  if (!password || password.length < 6) {
    return { ok: false, error: 'invalid_password' }
  }
  const admin = await getAdmin(kv, id)
  if (!admin) return { ok: false, error: 'not_found' }
  admin.passwordHash = await hashPassword(password)
  admin.updatedAt = new Date().toISOString()
  await putAdmin(kv, admin)
  return { ok: true, admin }
}

export async function authenticateAdmin(
  kv: KVNamespace,
  username: string,
  password: string,
): Promise<AdminRecord | null> {
  await ensureDefaultAdmin(kv)
  const admin = await findAdminByUsername(kv, username)
  if (!admin || admin.status !== 'active') return null
  const ok = await verifyPassword(password, admin.passwordHash)
  return ok ? admin : null
}

export function sessionEmailForAdmin(admin: AdminRecord): string {
  return admin.email ?? `${admin.username}@admin.local`
}

export async function loadAdminWithRole(
  kv: KVNamespace,
  admin: AdminRecord,
): Promise<{ admin: AdminRecord; role: RoleRecord | null }> {
  await ensureDefaultRoles(kv)
  const role = await getRole(kv, admin.roleId)
  return { admin, role }
}
