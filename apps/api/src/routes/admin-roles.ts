import { Hono } from 'hono'
import type { DataScope } from '@vault/shared'
import type { AppEnv } from '../types'
import { requireAdmin } from '../lib/admin-auth'
import { countAdminsByRole, loadAdminWithRole } from '../lib/admins'
import {
  createRole,
  deleteRole,
  ensureDefaultRoles,
  getRole,
  listRoles,
  toRolePublic,
  updateRole,
} from '../lib/roles'
import { ADMIN_PERMISSION_TREE } from '@vault/shared'

export const adminRolesRoutes = new Hono<AppEnv>()

adminRolesRoutes.use('*', requireAdmin)

adminRolesRoutes.get('/meta/tree', async (c) => {
  return c.json({ tree: ADMIN_PERMISSION_TREE })
})

adminRolesRoutes.get('/', async (c) => {
  await ensureDefaultRoles(c.env.KV)
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.menus.includes('settings.roles')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const rows = await listRoles(c.env.KV)
  const roles = []
  for (const role of rows) {
    const adminCount = await countAdminsByRole(c.env.KV, role.id)
    roles.push(toRolePublic(role, adminCount))
  }
  return c.json({ roles })
})

adminRolesRoutes.post('/', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.buttons.includes('settings.roles.create')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    code?: string
    remark?: string
    menus?: string[]
    buttons?: string[]
    dataScope?: DataScope
  }
  if (!body.name || !body.code) {
    return c.json({ error: 'invalid_payload' }, 400)
  }

  const result = await createRole(c.env.KV, {
    name: body.name,
    code: body.code,
    remark: body.remark,
    menus: body.menus,
    buttons: body.buttons,
    dataScope: body.dataScope,
  })
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ ok: true, role: toRolePublic(result.role, 0) }, 201)
})

adminRolesRoutes.patch('/:id', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.buttons.includes('settings.roles.edit')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    remark?: string
    menus?: string[]
    buttons?: string[]
    dataScope?: DataScope
  }

  const result = await updateRole(c.env.KV, id, body)
  if (!result.ok) {
    return c.json(
      { error: result.error },
      result.error === 'not_found' ? 404 : 400,
    )
  }
  const adminCount = await countAdminsByRole(c.env.KV, id)
  return c.json({ ok: true, role: toRolePublic(result.role, adminCount) })
})

adminRolesRoutes.delete('/:id', async (c) => {
  const actor = c.get('admin')!
  const { role: actorRole } = await loadAdminWithRole(c.env.KV, actor)
  if (!actorRole?.buttons.includes('settings.roles.delete')) {
    return c.json({ error: 'forbidden' }, 403)
  }

  const id = c.req.param('id')
  const adminCount = await countAdminsByRole(c.env.KV, id)
  const result = await deleteRole(c.env.KV, id, adminCount)
  if (!result.ok) {
    return c.json(
      { error: result.error },
      result.error === 'not_found' ? 404 : 400,
    )
  }
  return c.json({ ok: true })
})

/** optional: get one */
adminRolesRoutes.get('/:id', async (c) => {
  await ensureDefaultRoles(c.env.KV)
  const role = await getRole(c.env.KV, c.req.param('id'))
  if (!role) return c.json({ error: 'not_found' }, 404)
  const adminCount = await countAdminsByRole(c.env.KV, role.id)
  return c.json({ role: toRolePublic(role, adminCount) })
})
