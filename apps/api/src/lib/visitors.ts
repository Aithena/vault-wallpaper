export type VisitorPageview = {
  id: string
  at: string
  visitorId: string
  path: string
  label?: string
  ip: string
  country?: string
  city?: string
  region?: string
  device: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown'
  os?: string
  browser?: string
  userAgent?: string
  userId?: string | null
  email?: string | null
}

const INDEX_KEY = 'visitors:pageviews:index'
const MAX_INDEX = 5000
const DAY_STATS_PREFIX = 'visitors:day:'

function pvKey(id: string) {
  return `visitors:pv:${id}`
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
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

export function parseUserAgent(ua: string): {
  device: VisitorPageview['device']
  os?: string
  browser?: string
} {
  const s = ua || ''
  const lower = s.toLowerCase()
  let device: VisitorPageview['device'] = 'desktop'
  if (/bot|spider|crawl|slurp|facebookexternalhit/i.test(s)) device = 'bot'
  else if (/ipad|tablet|kindle|playbook/i.test(s)) device = 'tablet'
  else if (/mobi|iphone|android.*mobile|windows phone/i.test(s)) device = 'mobile'

  let os: string | undefined
  if (/windows nt/i.test(s)) os = 'Windows'
  else if (/android/i.test(s)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(s)) os = 'iOS'
  else if (/mac os x/i.test(s)) os = 'macOS'
  else if (/linux/i.test(s)) os = 'Linux'

  let browser: string | undefined
  if (/edg\//i.test(s)) browser = 'Edge'
  else if (/chrome\//i.test(s) && !/edg\//i.test(s)) browser = 'Chrome'
  else if (/safari\//i.test(s) && !/chrome\//i.test(s)) browser = 'Safari'
  else if (/firefox\//i.test(s)) browser = 'Firefox'
  else if (lower.includes('msie') || /trident\//i.test(s)) browser = 'IE'

  return { device, os, browser }
}

export function geoFromCf(cf: IncomingRequestCfProperties | undefined): {
  country?: string
  city?: string
  region?: string
} {
  if (!cf) return {}
  return {
    country: typeof cf.country === 'string' ? cf.country : undefined,
    city: typeof cf.city === 'string' ? cf.city : undefined,
    region: typeof cf.region === 'string' ? cf.region : undefined,
  }
}

type DayBucket = {
  date: string
  pv: number
  visitors: string[]
}

/** Skip rewriting the day bucket if this visitor already bumped within the window. */
const DAY_BUMP_THROTTLE_SECONDS = 60
/** Guest detail rows: at most one per visitor in this window (first hit always kept). */
const DETAIL_THROTTLE_GUEST_SECONDS = 120
/** Logged-in detail rows: slightly denser, still capped. */
const DETAIL_THROTTLE_USER_SECONDS = 45

function dayBumpThrottleKey(date: string, visitorId: string) {
  return `visitors:day_bump:${date}:${visitorId}`
}

function detailThrottleKey(visitorId: string) {
  return `visitors:detail_throttle:${visitorId}`
}

async function bumpDayStats(kv: KVNamespace, at: string, visitorId: string) {
  const date = dayKey(at)
  const throttleKey = dayBumpThrottleKey(date, visitorId)
  const throttled = await kv.get(throttleKey)
  // Same visitor within the window: skip day-bucket rewrite (PV slightly under-counted).
  if (throttled) return

  const key = `${DAY_STATS_PREFIX}${date}`
  const raw = await kv.get(key)
  let bucket: DayBucket = raw
    ? (JSON.parse(raw) as DayBucket)
    : { date, pv: 0, visitors: [] }

  bucket.pv += 1
  if (!bucket.visitors.includes(visitorId)) {
    bucket.visitors.push(visitorId)
    if (bucket.visitors.length > 8000) {
      bucket.visitors = bucket.visitors.slice(-8000)
    }
  }
  await kv.put(key, JSON.stringify(bucket), { expirationTtl: 60 * 60 * 24 * 90 })
  await kv.put(throttleKey, '1', { expirationTtl: DAY_BUMP_THROTTLE_SECONDS })
}

/**
 * Day UV/PV always attempted (throttled per visitor).
 * Detail list rows are throttled so guests still appear, without 1:1 writes per SPA hop.
 */
export async function writeVisitorPageview(
  kv: KVNamespace,
  input: Omit<VisitorPageview, 'id' | 'at'> & { at?: string },
): Promise<VisitorPageview> {
  const id = crypto.randomUUID()
  const at = input.at || new Date().toISOString()
  const record: VisitorPageview = {
    id,
    at,
    visitorId: input.visitorId.slice(0, 64),
    path: input.path.slice(0, 200),
    label: input.label?.slice(0, 120),
    ip: input.ip.slice(0, 64),
    country: input.country,
    city: input.city,
    region: input.region,
    device: input.device,
    os: input.os,
    browser: input.browser,
    userAgent: input.userAgent?.slice(0, 300),
    userId: input.userId ?? null,
    email: input.email ?? null,
  }

  await bumpDayStats(kv, at, record.visitorId)

  const loggedIn = Boolean(record.userId)
  const dKey = detailThrottleKey(record.visitorId)
  const detailThrottled = await kv.get(dKey)
  if (!detailThrottled) {
    await kv.put(pvKey(id), JSON.stringify(record))
    const ids = await readIndex(kv)
    ids.unshift(id)
    await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
    await kv.put(dKey, '1', {
      expirationTtl: loggedIn
        ? DETAIL_THROTTLE_USER_SECONDS
        : DETAIL_THROTTLE_GUEST_SECONDS,
    })
  }

  return record
}

export async function listVisitorPageviews(
  kv: KVNamespace,
  limit = 500,
): Promise<VisitorPageview[]> {
  const ids = (await readIndex(kv)).slice(0, limit)
  const rows: VisitorPageview[] = []
  for (const id of ids) {
    const raw = await kv.get(pvKey(id))
    if (raw) rows.push(JSON.parse(raw) as VisitorPageview)
  }
  return rows
}

export async function getVisitorDayStats(
  kv: KVNamespace,
  days = 14,
): Promise<{ date: string; pv: number; uv: number }[]> {
  const to = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(`${to}T00:00:00.000Z`)
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1))
  const from = fromDate.toISOString().slice(0, 10)
  return getVisitorDayStatsRange(kv, from, to)
}

export async function getVisitorDayStatsRange(
  kv: KVNamespace,
  from: string,
  to: string,
): Promise<{ date: string; pv: number; uv: number }[]> {
  const out: { date: string; pv: number; uv: number }[] = []
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return out

  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10)
    const raw = await kv.get(`${DAY_STATS_PREFIX}${date}`)
    if (!raw) {
      out.push({ date, pv: 0, uv: 0 })
      continue
    }
    const bucket = JSON.parse(raw) as DayBucket
    out.push({
      date,
      pv: bucket.pv || 0,
      uv: bucket.visitors?.length || 0,
    })
  }
  return out
}

export function summarizeVisitorRows(rows: VisitorPageview[]) {
  const byCountry = new Map<string, number>()
  const byDevice = new Map<string, number>()
  const byPath = new Map<string, number>()
  const visitors = new Set<string>()
  for (const r of rows) {
    visitors.add(r.visitorId)
    const country = r.country || '未知'
    byCountry.set(country, (byCountry.get(country) || 0) + 1)
    byDevice.set(r.device, (byDevice.get(r.device) || 0) + 1)
    const path = r.path.split('?')[0] || r.path
    byPath.set(path, (byPath.get(path) || 0) + 1)
  }
  const toSorted = (m: Map<string, number>, limit = 10) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

  return {
    pv: rows.length,
    uv: visitors.size,
    byCountry: toSorted(byCountry),
    byDevice: toSorted(byDevice, 8),
    byPath: toSorted(byPath, 15),
  }
}
