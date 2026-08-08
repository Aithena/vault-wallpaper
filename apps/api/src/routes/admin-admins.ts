import { Hono } from 'hono'
import type { AdminDataScopeOverride, AdminStatus } from '@vault/shared'
import { SYSTEM_ROLE_SUPER_ID } from '@vault/shared'
import type { AppEnv } from '../types'
import {
  createAdmin,
  ensureDefaultAdmin,
  listAdmins,
  loadAdminWithRole,
  setAdminPassword,
  toAdminPublic,
  updateAdmin,
} from '../lib/admins'
import { requireAdmin } from '../lib/admin-auth'
import { listRoles, toRolePublic } from '../lib/roles'

export const adminAdminsRoutes = new Hono<AppEnv>()

adminAdminsRoutes.use('*', requireAdmin)

adminAdminsRoutes.get('/meta/roles', async (c) => {
  await ensureDefaultAdmin(c.env.KV)
  const roles = await listRoles(c.env.KV)
  return c.json({ roles: roles.map((r) => toRolePublic(r)) })
})

adminAdminsRoutes.get('/', async (c) => {
  await ensureDefaultAdmin(c.env.KV)
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.menus.includes('settings.admins')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const rows = await listAdmins(c.env.KV)
  const admins = []
  for (const row of rows) {
    const { role } = await loadAdminWithRole(c.env.KV, row)
    admins.push(toAdminPublic(row, role))
  }
  return c.json({ admins })
})

adminAdminsRoutes.post('/', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.buttons.includes('settings.admins.create')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string
    password?: string
    nickName?: string
    realName?: string
    /** @deprecated use nickName */
    name?: string
    email?: string | null
    roleId?: string
    dataScope?: AdminDataScopeOverride
  }

  if (!body.username || !body.password || !body.roleId) {
    return c.json({ error: 'invalid_payload' }, 400)
  }

  // 仅超管角色账号可创建绑定超管角色的管理员
  if (
    body.roleId === SYSTEM_ROLE_SUPER_ID &&
    actor.roleId !== SYSTEM_ROLE_SUPER_ID
  ) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const result = await createAdmin(c.env.KV, {
    username: body.username,
    password: body.password,
    nickName: body.nickName ?? body.name ?? body.username,
    realName: body.realName ?? '',
    email: body.email,
    roleId: body.roleId,
    dataScope: body.dataScope,
  })
  if (!result.ok) return c.json({ error: result.error }, 400)
  const { role } = await loadAdminWithRole(c.env.KV, result.admin)
  return c.json({ ok: true, admin: toAdminPublic(result.admin, role) }, 201)
})

adminAdminsRoutes.patch('/:id', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    nickName?: string
    realName?: string
    /** @deprecated use nickName */
    name?: string
    username?: string
    email?: string | null
    roleId?: string
    dataScope?: AdminDataScopeOverride
    status?: AdminStatus
  }

  const needEdit =
    body.nickName !== undefined ||
    body.realName !== undefined ||
    body.name !== undefined ||
    body.username !== undefined ||
    body.roleId !== undefined ||
    body.dataScope !== undefined
  const needEmail = body.email !== undefined
  const needDisable = body.status !== undefined

  if (needEdit && !actorRole?.buttons.includes('settings.admins.edit')) {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (needEmail && !actorRole?.buttons.includes('settings.admins.email')) {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (needDisable && !actorRole?.buttons.includes('settings.admins.disable')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  if (
    body.roleId === SYSTEM_ROLE_SUPER_ID &&
    actor.roleId !== SYSTEM_ROLE_SUPER_ID
  ) {
    return c.json({ error: 'forbidden' }, 403)
  }

  if (body.status === 'disabled' && id === actor.id) {
    return c.json({ error: 'cannot_disable_self' }, 400)
  }

  const result = await updateAdmin(c.env.KV, id, {
    nickName: body.nickName ?? body.name,
    realName: body.realName,
    username: body.username,
    email: body.email,
    roleId: body.roleId,
    dataScope: body.dataScope,
    status: body.status,
  })
  if (!result.ok) {
    return c.json(
      { error: result.error },
      result.error === 'not_found' ? 404 : 400,
    )
  }
  const { role } = await loadAdminWithRole(c.env.KV, result.admin)
  return c.json({ ok: true, admin: toAdminPublic(result.admin, role) })
})

adminAdminsRoutes.post('/:id/password', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.buttons.includes('settings.admins.password')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { password?: string }
  if (!body.password) return c.json({ error: 'invalid_payload' }, 400)

  const result = await setAdminPassword(c.env.KV, id, body.password)
  if (!result.ok) {
    return c.json(
      { error: result.error },
      result.error === 'not_found' ? 404 : 400,
    )
  }
  return c.json({ ok: true })
})
