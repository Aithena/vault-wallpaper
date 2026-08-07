import {
  listAllButtonKeys,
  listAllMenuKeys,
  SYSTEM_ROLE_OPS_ID,
  SYSTEM_ROLE_SUPER_ID,
  type DataScope,
  type RolePublic,
} from '@vault/shared'

export type RoleRecord = {
  id: string
  name: string
  code: string
  remark: string
  menus: string[]
  buttons: string[]
  dataScope: DataScope
  system: boolean
  createdAt: string
  updatedAt: string
}

const INDEX_KEY = 'roles:index'

function roleKey(id: string) {
  return `role:${id}`
}

function codeKey(code: string) {
  return `role_code:${code.trim().toLowerCase()}`
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

export function toRolePublic(
  role: RoleRecord,
  adminCount?: number,
): RolePublic {
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    remark: role.remark,
    menus: role.menus,
    buttons: role.buttons,
    dataScope: role.dataScope,
    system: role.system,
    adminCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }
}

export async function getRole(
  kv: KVNamespace,
  id: string,
): Promise<RoleRecord | null> {
  const raw = await kv.get(roleKey(id))
  if (!raw) return null
  return JSON.parse(raw) as RoleRecord
}

export async function findRoleByCode(
  kv: KVNamespace,
  code: string,
): Promise<RoleRecord | null> {
  const id = await kv.get(codeKey(code))
  if (!id) return null
  return getRole(kv, id)
}

export async function listRoles(kv: KVNamespace): Promise<RoleRecord[]> {
  const ids = await readIndex(kv)
  const rows: RoleRecord[] = []
  for (const id of ids) {
    const role = await getRole(kv, id)
    if (role) rows.push(role)
  }
  rows.sort((a, b) => {
    if (a.system !== b.system) return a.system ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
  return rows
}

async function putRole(kv: KVNamespace, role: RoleRecord) {
  await kv.put(roleKey(role.id), JSON.stringify(role))
}

function sanitizeMenus(menus: string[] | undefined): string[] {
  const allow = new Set(listAllMenuKeys())
  return [...new Set((menus ?? []).filter((k) => allow.has(k)))]
}

function sanitizeButtons(
  buttons: string[] | undefined,
  menus: string[],
): string[] {
  const allow = new Set(listAllButtonKeys())
  const menuSet = new Set(menus)
  return [
    ...new Set(
      (buttons ?? []).filter((k) => {
        if (!allow.has(k)) return false
        const menuKey = k.split('.').slice(0, -1).join('.')
        // buttons like wallpapers.list.approve → menu wallpapers.list
        // also settings.admins.create → settings.admins
        const parts = k.split('.')
        const parent =
          parts.length >= 3 ? `${parts[0]}.${parts[1]}` : parts[0] ?? ''
        return menuSet.has(parent) || menuSet.has(menuKey)
      }),
    ),
  ]
}

export async function ensureDefaultRoles(kv: KVNamespace): Promise<void> {
  const allMenus = listAllMenuKeys()
  const allButtons = listAllButtonKeys()
  const now = new Date().toISOString()

  let superRole = await getRole(kv, SYSTEM_ROLE_SUPER_ID)
  if (!superRole) {
    superRole = {
      id: SYSTEM_ROLE_SUPER_ID,
      name: '超级管理员',
      code: 'super',
      remark: '系统内置，拥有全部菜单与按钮',
      menus: allMenus,
      buttons: allButtons,
      dataScope: 'all',
      system: true,
      createdAt: now,
      updatedAt: now,
    }
    await putRole(kv, superRole)
    await kv.put(codeKey(superRole.code), superRole.id)
  } else {
    // keep system role in sync with permission tree
    superRole.menus = allMenus
    superRole.buttons = allButtons
    superRole.dataScope = 'all'
    superRole.updatedAt = now
    await putRole(kv, superRole)
  }

  let opsRole = await getRole(kv, SYSTEM_ROLE_OPS_ID)
  const opsMenus = allMenus.filter(
    (k) => k !== 'settings.roles' && k !== 'settings.admins',
  )
  const opsButtons = allButtons.filter(
    (k) =>
      !k.startsWith('settings.roles.') && !k.startsWith('settings.admins.'),
  )
  if (!opsRole) {
    opsRole = {
      id: SYSTEM_ROLE_OPS_ID,
      name: '运营',
      code: 'ops',
      remark: '系统内置运营角色（不含员工管理与角色管理）',
      menus: opsMenus,
      buttons: opsButtons,
      dataScope: 'all',
      system: true,
      createdAt: now,
      updatedAt: now,
    }
    await putRole(kv, opsRole)
    await kv.put(codeKey(opsRole.code), opsRole.id)
  } else if (opsRole.system) {
    opsRole.menus = opsMenus
    opsRole.buttons = opsButtons
    opsRole.updatedAt = now
    await putRole(kv, opsRole)
  }

  const ids = await readIndex(kv)
  const next = new Set(ids)
  next.add(SYSTEM_ROLE_SUPER_ID)
  next.add(SYSTEM_ROLE_OPS_ID)
  await writeIndex(kv, [...next])
}

export async function createRole(
  kv: KVNamespace,
  input: {
    name: string
    code: string
    remark?: string
    menus?: string[]
    buttons?: string[]
    dataScope?: DataScope
  },
): Promise<{ ok: true; role: RoleRecord } | { ok: false; error: string }> {
  const name = input.name.trim()
  const code = input.code.trim().toLowerCase()
  if (!name) return { ok: false, error: 'invalid_name' }
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(code)) {
    return { ok: false, error: 'invalid_role_code' }
  }
  if (await findRoleByCode(kv, code)) {
    return { ok: false, error: 'code_taken' }
  }

  const menus = sanitizeMenus(input.menus)
  const buttons = sanitizeButtons(input.buttons, menus)
  const now = new Date().toISOString()
  const role: RoleRecord = {
    id: crypto.randomUUID(),
    name,
    code,
    remark: input.remark?.trim() || '',
    menus,
    buttons,
    dataScope: input.dataScope === 'self' ? 'self' : 'all',
    system: false,
    createdAt: now,
    updatedAt: now,
  }
  await putRole(kv, role)
  await kv.put(codeKey(code), role.id)
  const ids = await readIndex(kv)
  ids.push(role.id)
  await writeIndex(kv, ids)
  return { ok: true, role }
}

export async function updateRole(
  kv: KVNamespace,
  id: string,
  patch: {
    name?: string
    remark?: string
    menus?: string[]
    buttons?: string[]
    dataScope?: DataScope
  },
): Promise<{ ok: true; role: RoleRecord } | { ok: false; error: string }> {
  const role = await getRole(kv, id)
  if (!role) return { ok: false, error: 'not_found' }

  if (role.system && id === SYSTEM_ROLE_SUPER_ID) {
    // super: only allow remark/name tweak; menus always full
    if (patch.name !== undefined) role.name = patch.name.trim() || role.name
    if (patch.remark !== undefined) role.remark = patch.remark.trim()
    role.menus = listAllMenuKeys()
    role.buttons = listAllButtonKeys()
    role.dataScope = 'all'
  } else {
    if (patch.name !== undefined) role.name = patch.name.trim() || role.name
    if (patch.remark !== undefined) role.remark = patch.remark.trim()
    if (patch.menus !== undefined) role.menus = sanitizeMenus(patch.menus)
    if (patch.buttons !== undefined) {
      role.buttons = sanitizeButtons(patch.buttons, role.menus)
    } else if (patch.menus !== undefined) {
      role.buttons = sanitizeButtons(role.buttons, role.menus)
    }
    if (patch.dataScope !== undefined) {
      role.dataScope = patch.dataScope === 'self' ? 'self' : 'all'
    }
  }

  role.updatedAt = new Date().toISOString()
  await putRole(kv, role)
  return { ok: true, role }
}

export async function deleteRole(
  kv: KVNamespace,
  id: string,
  adminCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getRole(kv, id)
  if (!role) return { ok: false, error: 'not_found' }
  if (role.system) return { ok: false, error: 'system_role' }
  if (adminCount > 0) return { ok: false, error: 'role_in_use' }

  await kv.delete(roleKey(id))
  await kv.delete(codeKey(role.code))
  const ids = (await readIndex(kv)).filter((x) => x !== id)
  await writeIndex(kv, ids)
  return { ok: true }
}
