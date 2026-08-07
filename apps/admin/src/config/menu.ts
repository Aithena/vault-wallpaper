import { ADMIN_PERMISSION_TREE } from '@vault/shared'

export type AdminMenuChild = {
  id: string
  label: string
  path: string
  menuKey: string
}

export type AdminMenuGroup = {
  id: string
  label: string
  icon: string
  children: AdminMenuChild[]
}

/** C 一级 + E 二级，与权限树对齐 */
export const ADMIN_MENU: AdminMenuGroup[] = ADMIN_PERMISSION_TREE.map((g) => ({
  id: g.key,
  label: g.label,
  icon: g.icon,
  children: g.menus.map((m) => ({
    id: m.key,
    label: m.label,
    path: m.path,
    menuKey: m.key,
  })),
}))

export function findGroupByPath(path: string): AdminMenuGroup | undefined {
  const normalized = path.split('?')[0]
  return ADMIN_MENU.find((group) =>
    group.children.some(
      (child) =>
        normalized === child.path ||
        (child.path !== '/' && normalized.startsWith(`${child.path}/`)),
    ),
  )
}

export function defaultPathForGroup(
  groupId: string,
  allowedMenus?: string[] | null,
): string {
  const group = ADMIN_MENU.find((g) => g.id === groupId)
  if (!group) return '/dashboard'
  const child = group.children.find(
    (c) => !allowedMenus || allowedMenus.includes(c.menuKey),
  )
  return child?.path ?? group.children[0]?.path ?? '/dashboard'
}

export function filterMenuByPermissions(
  menus: string[] | null | undefined,
): AdminMenuGroup[] {
  if (!menus) return ADMIN_MENU
  const set = new Set(menus)
  return ADMIN_MENU.map((g) => ({
    ...g,
    children: g.children.filter((c) => set.has(c.menuKey)),
  })).filter((g) => g.children.length > 0)
}
