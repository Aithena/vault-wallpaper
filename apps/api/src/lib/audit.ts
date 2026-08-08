export type AuditRecord = {
  id: string
  at: string
  adminId: string
  adminUsername: string
  action: string
  target: string
  detail?: string
}

/** Single-key ring buffer — 1 write per audit instead of record+index. */
const RECENT_KEY = 'audits:recent_v1'
const MAX_RECENT = 500
const LEGACY_INDEX_KEY = 'audits:index'

function auditKey(id: string) {
  return `audit:${id}`
}

async function readRecent(kv: KVNamespace): Promise<AuditRecord[] | null> {
  const raw = await kv.get(RECENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuditRecord[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function migrateFromLegacy(kv: KVNamespace): Promise<AuditRecord[]> {
  const raw = await kv.get(LEGACY_INDEX_KEY)
  if (!raw) return []
  let ids: string[] = []
  try {
    ids = JSON.parse(raw) as string[]
    if (!Array.isArray(ids)) ids = []
  } catch {
    return []
  }
  const rows = (
    await Promise.all(
      ids.slice(0, MAX_RECENT).map(async (id) => {
        const r = await kv.get(auditKey(id))
        return r ? (JSON.parse(r) as AuditRecord) : null
      }),
    )
  ).filter((r): r is AuditRecord => Boolean(r))
  if (rows.length) {
    await kv.put(RECENT_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)))
  }
  return rows
}

export async function writeAudit(
  kv: KVNamespace,
  input: {
    adminId: string
    adminUsername: string
    action: string
    target: string
    detail?: string
  },
): Promise<void> {
  const record: AuditRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    adminId: input.adminId,
    adminUsername: input.adminUsername,
    action: input.action,
    target: input.target,
    detail: input.detail,
  }
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  items.unshift(record)
  await kv.put(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
}

export async function listAudits(
  kv: KVNamespace,
  limit = 100,
): Promise<AuditRecord[]> {
  let items = await readRecent(kv)
  if (!items) items = await migrateFromLegacy(kv)
  return items.slice(0, limit)
}
