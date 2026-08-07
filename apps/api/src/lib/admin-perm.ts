import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { loadAdminWithRole } from './admins'
import type { AdminRecord } from './admins'
import type { RoleRecord } from './roles'

export async function actorPerms(c: Context<AppEnv>): Promise<{
  admin: AdminRecord
  role: RoleRecord | null
}> {
  const admin = c.get('admin')!
  return loadAdminWithRole(c.env.KV, admin)
}

export async function requireMenu(
  c: Context<AppEnv>,
  menuKey: string,
): Promise<Response | null> {
  const { role } = await actorPerms(c)
  if (!role?.menus.includes(menuKey)) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return null
}

export async function requireAnyMenu(
  c: Context<AppEnv>,
  menuKeys: string[],
): Promise<Response | null> {
  const { role } = await actorPerms(c)
  if (!menuKeys.some((key) => role?.menus.includes(key))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return null
}

export async function requireButton(
  c: Context<AppEnv>,
  buttonKey: string,
): Promise<Response | null> {
  const { role } = await actorPerms(c)
  if (!role?.buttons.includes(buttonKey)) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return null
}
