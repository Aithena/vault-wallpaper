import type { Context } from 'hono'
import type { DataScope } from '@vault/shared'
import type { AppEnv } from '../types'
import {
  loadAdminWithRole,
  resolveEffectiveDataScope,
  type AdminRecord,
} from './admins'

export async function getActorScope(c: Context<AppEnv>): Promise<{
  admin: AdminRecord
  scope: DataScope
}> {
  const admin = c.get('admin')!
  const { role } = await loadAdminWithRole(c.env.KV, admin)
  return { admin, scope: resolveEffectiveDataScope(admin, role) }
}

/** Modules with personal ownership: filter to creator when scope=self. */
export function filterOwned<T extends { createdByAdminId?: string }>(
  rows: T[],
  scope: DataScope,
  adminId: string,
): T[] {
  if (scope !== 'self') return rows
  return rows.filter((r) => r.createdByAdminId === adminId)
}

export function filterAuditByAdmin<T extends { adminId: string }>(
  rows: T[],
  scope: DataScope,
  adminId: string,
): T[] {
  if (scope !== 'self') return rows
  return rows.filter((r) => r.adminId === adminId)
}

export function assertOwned(
  scope: DataScope,
  adminId: string,
  createdByAdminId: string | undefined,
): boolean {
  if (scope !== 'self') return true
  return createdByAdminId === adminId
}
