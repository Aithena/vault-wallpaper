/** Cloudflare GraphQL Analytics helpers (same data as CF dashboard Metrics). */

const GQL_URL = 'https://api.cloudflare.com/client/v4/graphql'

export type KvDayOps = {
  date: string
  read: number
  write: number
  delete: number
  list: number
}

export type WorkersDayOps = {
  date: string
  requests: number
  errors: number
  subrequests: number
  cpuTimeP50?: number
  cpuTimeP99?: number
}

export type R2DayOps = {
  date: string
  classA: number
  classB: number
  other: number
}

export type R2StorageSnapshot = {
  objectCount: number
  uploadCount: number
  payloadBytes: number
  metadataBytes: number
}

export type AiDayOps = {
  date: string
  requests: number
  inputTokens: number
  outputTokens: number
}

/** Free-plan daily caps (account-wide). Paid plans are much higher. */
export const KV_FREE_DAILY_CAPS = {
  read: 100_000,
  write: 1_000,
  delete: 1_000,
  list: 1_000,
} as const

/** Workers free: ~100k requests / day. */
export const WORKERS_FREE_DAILY_CAPS = {
  requests: 100_000,
} as const

/** R2 free is monthly; show approximate daily Class A/B for awareness. */
export const R2_FREE_MONTHLY_CAPS = {
  classA: 1_000_000,
  classB: 10_000_000,
} as const

type GqlBody = {
  data?: {
    viewer?: {
      accounts?: Array<Record<string, unknown>>
    }
  }
  errors?: Array<{ message?: string }>
}

async function gqlFetch<T = unknown>(
  apiToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json().catch(() => ({}))) as GqlBody
  if (!res.ok) {
    throw new Error(body.errors?.[0]?.message || `cloudflare_http_${res.status}`)
  }
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message || 'cloudflare_graphql_error')
  }
  return body.data?.viewer?.accounts?.[0] as T
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return out
  for (let t = start; t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function toDateKey(v: string | undefined): string | null {
  if (!v) return null
  return v.slice(0, 10)
}

export async function fetchKvDailyOperations(input: {
  accountId: string
  apiToken: string
  namespaceId?: string
  dateFrom: string
  dateTo: string
}): Promise<KvDayOps[]> {
  const query = `
    query KvOps($accountTag: string!, $namespaceId: string, $start: Date, $end: Date) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvOperationsAdaptiveGroups(
            filter: { namespaceId: $namespaceId, date_geq: $start, date_leq: $end }
            limit: 10000
            orderBy: [date_ASC]
          ) {
            sum { requests }
            dimensions { date actionType }
          }
        }
      }
    }
  `
  const variables: Record<string, string> = {
    accountTag: input.accountId,
    start: input.dateFrom,
    end: input.dateTo,
  }
  if (input.namespaceId) variables.namespaceId = input.namespaceId

  const account = await gqlFetch<{
    kvOperationsAdaptiveGroups?: Array<{
      sum: { requests: number }
      dimensions: { date: string; actionType: string }
    }>
  }>(input.apiToken, query, variables)

  const byDate = new Map<string, KvDayOps>()
  for (const d of eachDate(input.dateFrom, input.dateTo)) {
    byDate.set(d, { date: d, read: 0, write: 0, delete: 0, list: 0 })
  }
  for (const r of account.kvOperationsAdaptiveGroups || []) {
    const date = toDateKey(r.dimensions?.date)
    if (!date || !byDate.has(date)) continue
    const row = byDate.get(date)!
    const n = Number(r.sum?.requests || 0)
    const action = String(r.dimensions.actionType || '').toLowerCase()
    if (action === 'read') row.read += n
    else if (action === 'write') row.write += n
    else if (action === 'delete') row.delete += n
    else if (action === 'list') row.list += n
  }
  return [...byDate.values()]
}

export async function fetchWorkersDaily(input: {
  accountId: string
  apiToken: string
  scriptName?: string
  dateFrom: string
  dateTo: string
}): Promise<WorkersDayOps[]> {
  const query = `
    query WorkersDaily(
      $accountTag: string!
      $scriptName: string
      $start: Time!
      $end: Time!
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: {
              scriptName: $scriptName
              datetime_geq: $start
              datetime_leq: $end
            }
          ) {
            sum { requests errors subrequests }
            quantiles { cpuTimeP50 cpuTimeP99 }
            dimensions { datetime }
          }
        }
      }
    }
  `

  const account = await gqlFetch<{
    workersInvocationsAdaptive?: Array<{
      sum: { requests: number; errors: number; subrequests: number }
      quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number }
      dimensions: { datetime: string }
    }>
  }>(input.apiToken, query, {
    accountTag: input.accountId,
    scriptName: input.scriptName || 'vault-wallpaper-api',
    start: `${input.dateFrom}T00:00:00Z`,
    end: `${input.dateTo}T23:59:59Z`,
  })

  const byDate = new Map<string, WorkersDayOps>()
  for (const d of eachDate(input.dateFrom, input.dateTo)) {
    byDate.set(d, { date: d, requests: 0, errors: 0, subrequests: 0 })
  }
  for (const r of account.workersInvocationsAdaptive || []) {
    const date = toDateKey(r.dimensions?.datetime)
    if (!date || !byDate.has(date)) continue
    const row = byDate.get(date)!
    row.requests += Number(r.sum?.requests || 0)
    row.errors += Number(r.sum?.errors || 0)
    row.subrequests += Number(r.sum?.subrequests || 0)
    if (r.quantiles?.cpuTimeP50 != null) row.cpuTimeP50 = r.quantiles.cpuTimeP50
    if (r.quantiles?.cpuTimeP99 != null) row.cpuTimeP99 = r.quantiles.cpuTimeP99
  }
  return [...byDate.values()]
}

/** Class A roughly: writes/lists; Class B: reads. Map common actionType strings. */
function r2Class(action: string): 'classA' | 'classB' | 'other' {
  const a = action.toLowerCase()
  if (
    a.includes('put') ||
    a.includes('upload') ||
    a.includes('copy') ||
    a.includes('list') ||
    a.includes('create') ||
    a.includes('multipart')
  ) {
    return 'classA'
  }
  if (a.includes('get') || a.includes('head') || a.includes('read')) return 'classB'
  if (a.includes('delete')) return 'classA'
  return 'other'
}

export async function fetchR2Daily(input: {
  accountId: string
  apiToken: string
  bucketName?: string
  dateFrom: string
  dateTo: string
}): Promise<{ days: R2DayOps[]; storage: R2StorageSnapshot | null }> {
  const opsQuery = `
    query R2Ops(
      $accountTag: string!
      $bucketName: string
      $start: Date
      $end: Date
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              bucketName: $bucketName
              date_geq: $start
              date_leq: $end
            }
            orderBy: [date_ASC]
          ) {
            sum { requests }
            dimensions { date actionType }
          }
        }
      }
    }
  `

  const storageQuery = `
    query R2Storage(
      $accountTag: string!
      $bucketName: string
      $start: Time
      $end: Time
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(
            limit: 1
            filter: {
              bucketName: $bucketName
              datetime_geq: $start
              datetime_leq: $end
            }
            orderBy: [datetime_DESC]
          ) {
            max {
              objectCount
              uploadCount
              payloadSize
              metadataSize
            }
          }
        }
      }
    }
  `

  const variables = {
    accountTag: input.accountId,
    bucketName: input.bucketName || 'awall-wallpaper',
    start: input.dateFrom,
    end: input.dateTo,
  }

  let opsAccount: {
    r2OperationsAdaptiveGroups?: Array<{
      sum: { requests: number }
      dimensions: { date: string; actionType: string }
    }>
  }
  try {
    opsAccount = await gqlFetch(input.apiToken, opsQuery, variables)
  } catch {
    // Some accounts expose datetime filters instead of date — retry loosely without bucket filter fail-soft
    opsAccount = { r2OperationsAdaptiveGroups: [] }
  }

  const byDate = new Map<string, R2DayOps>()
  for (const d of eachDate(input.dateFrom, input.dateTo)) {
    byDate.set(d, { date: d, classA: 0, classB: 0, other: 0 })
  }
  for (const r of opsAccount.r2OperationsAdaptiveGroups || []) {
    const date = toDateKey(r.dimensions?.date)
    if (!date || !byDate.has(date)) continue
    const row = byDate.get(date)!
    const n = Number(r.sum?.requests || 0)
    const cls = r2Class(r.dimensions?.actionType || '')
    row[cls] += n
  }

  let storage: R2StorageSnapshot | null = null
  try {
    const storageAccount = await gqlFetch<{
      r2StorageAdaptiveGroups?: Array<{
        max: {
          objectCount?: number
          uploadCount?: number
          payloadSize?: number
          metadataSize?: number
        }
      }>
    }>(input.apiToken, storageQuery, {
      accountTag: input.accountId,
      bucketName: input.bucketName || 'awall-wallpaper',
      start: `${input.dateFrom}T00:00:00Z`,
      end: `${input.dateTo}T23:59:59Z`,
    })
    const max = storageAccount.r2StorageAdaptiveGroups?.[0]?.max
    if (max) {
      storage = {
        objectCount: Number(max.objectCount || 0),
        uploadCount: Number(max.uploadCount || 0),
        payloadBytes: Number(max.payloadSize || 0),
        metadataBytes: Number(max.metadataSize || 0),
      }
    }
  } catch {
    storage = null
  }

  return { days: [...byDate.values()], storage }
}

export async function fetchAiDaily(input: {
  accountId: string
  apiToken: string
  dateFrom: string
  dateTo: string
}): Promise<AiDayOps[]> {
  const query = `
    query AiDaily($accountTag: string!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          aiInferenceAdaptiveGroups(
            limit: 10000
            filter: { datetime_geq: $start, datetime_leq: $end }
            orderBy: [datetimeHour_ASC]
          ) {
            count
            sum {
              totalInputTokens
              totalOutputTokens
            }
            dimensions { datetimeHour modelId }
          }
        }
      }
    }
  `

  const account = await gqlFetch<{
    aiInferenceAdaptiveGroups?: Array<{
      count: number
      sum?: { totalInputTokens?: number; totalOutputTokens?: number }
      dimensions: { datetimeHour?: string; modelId?: string }
    }>
  }>(input.apiToken, query, {
    accountTag: input.accountId,
    start: `${input.dateFrom}T00:00:00Z`,
    end: `${input.dateTo}T23:59:59Z`,
  })

  const byDate = new Map<string, AiDayOps>()
  for (const d of eachDate(input.dateFrom, input.dateTo)) {
    byDate.set(d, { date: d, requests: 0, inputTokens: 0, outputTokens: 0 })
  }
  for (const r of account.aiInferenceAdaptiveGroups || []) {
    const date = toDateKey(r.dimensions?.datetimeHour)
    if (!date || !byDate.has(date)) continue
    const row = byDate.get(date)!
    row.requests += Number(r.count || 0)
    row.inputTokens += Number(r.sum?.totalInputTokens || 0)
    row.outputTokens += Number(r.sum?.totalOutputTokens || 0)
  }
  return [...byDate.values()]
}
