export type AuditRecord = {
  id: string
  at: string
  adminId: string
  adminUsername: string
  action: string
  target: string
  detail?: string
}

const INDEX_KEY = 'audits:index'
const MAX_INDEX = 500

function auditKey(id: string) {
  return `audit:${id}`
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
  const id = crypto.randomUUID()
  const record: AuditRecord = {
    id,
    at: new Date().toISOString(),
    adminId: input.adminId,
    adminUsername: input.adminUsername,
    action: input.action,
    target: input.target,
    detail: input.detail,
  }
  await kv.put(auditKey(id), JSON.stringify(record))
  const ids = await readIndex(kv)
  ids.unshift(id)
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
}

export async function listAudits(
  kv: KVNamespace,
  limit = 100,
): Promise<AuditRecord[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows: AuditRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(auditKey(id))
    if (raw) rows.push(JSON.parse(raw) as AuditRecord)
  }
  return rows
}
