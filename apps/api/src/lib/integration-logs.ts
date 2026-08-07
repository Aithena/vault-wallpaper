/** Archive of third-party API request / response payloads for later inspection. */

export type IntegrationProvider = 'workers_ai' | 'resend' | 'xunhupay'

export type IntegrationDirection = 'outbound' | 'inbound'

export type IntegrationLogRecord = {
  id: string
  createdAt: string
  provider: IntegrationProvider
  /** e.g. wallpaper.query / emails.send / payment.notify */
  action: string
  direction: IntegrationDirection
  ok: boolean
  durationMs: number
  /** Related entity ids for search */
  refType?: string
  refId?: string
  error?: string
  request?: unknown
  response?: unknown
  meta?: Record<string, unknown>
}

const INDEX_KEY = 'integration_logs:index'
const MAX_INDEX = 3000
const MAX_JSON_CHARS = 48_000

function logKey(id: string) {
  return `integration_log:${id}`
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

const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|appsecret|secret|password|token|hash|cookie|set-cookie)$/i

function truncateString(s: string, max = 8000): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…[truncated ${s.length - max} chars]`
}

/** Strip secrets and huge binary blobs (e.g. data URIs) before storage. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max_depth]'
  if (value == null) return value
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.includes('base64,')) {
      const comma = value.indexOf(',')
      const meta = comma >= 0 ? value.slice(0, comma) : 'data:'
      const len = comma >= 0 ? value.length - comma - 1 : value.length
      return `${meta},[omitted ${len} base64 chars]`
    }
    return truncateString(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((v) => sanitizeForLog(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = sanitizeForLog(v, depth + 1)
    }
    return out
  }
  return String(value)
}

function clampPayload(value: unknown): unknown {
  const sanitized = sanitizeForLog(value)
  try {
    const json = JSON.stringify(sanitized)
    if (json.length <= MAX_JSON_CHARS) return sanitized
    return {
      _truncated: true,
      preview: json.slice(0, MAX_JSON_CHARS),
      originalChars: json.length,
    }
  } catch {
    return { _error: 'unserializable' }
  }
}

export async function writeIntegrationLog(
  kv: KVNamespace,
  input: {
    provider: IntegrationProvider
    action: string
    direction?: IntegrationDirection
    ok: boolean
    durationMs?: number
    refType?: string
    refId?: string
    error?: string
    request?: unknown
    response?: unknown
    meta?: Record<string, unknown>
  },
): Promise<IntegrationLogRecord> {
  const id = crypto.randomUUID()
  const record: IntegrationLogRecord = {
    id,
    createdAt: new Date().toISOString(),
    provider: input.provider,
    action: input.action,
    direction: input.direction ?? 'outbound',
    ok: input.ok,
    durationMs: Math.max(0, Math.floor(input.durationMs ?? 0)),
    refType: input.refType,
    refId: input.refId,
    error: input.error ? truncateString(input.error, 500) : undefined,
    request: input.request !== undefined ? clampPayload(input.request) : undefined,
    response: input.response !== undefined ? clampPayload(input.response) : undefined,
    meta: input.meta ? (clampPayload(input.meta) as Record<string, unknown>) : undefined,
  }
  await kv.put(logKey(id), JSON.stringify(record))
  const ids = await readIndex(kv)
  ids.unshift(id)
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
  return record
}

/** Fire-and-forget safe write — never throws to callers. */
export async function safeWriteIntegrationLog(
  kv: KVNamespace | undefined,
  input: Parameters<typeof writeIntegrationLog>[1],
): Promise<void> {
  if (!kv) return
  try {
    await writeIntegrationLog(kv, input)
  } catch {
    /* logging must not break business flow */
  }
}

export async function listIntegrationLogs(
  kv: KVNamespace,
  limit = 500,
): Promise<IntegrationLogRecord[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows: IntegrationLogRecord[] = []
  for (const id of ids) {
    const raw = await kv.get(logKey(id))
    if (raw) rows.push(JSON.parse(raw) as IntegrationLogRecord)
  }
  return rows
}

export async function getIntegrationLog(
  kv: KVNamespace,
  id: string,
): Promise<IntegrationLogRecord | null> {
  const raw = await kv.get(logKey(id))
  return raw ? (JSON.parse(raw) as IntegrationLogRecord) : null
}
