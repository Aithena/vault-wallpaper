/** Shared date-window helpers for admin analytics / list APIs. */

export const DEFAULT_RANGE_DAYS = 30
export const MAX_RANGE_DAYS = 365

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function todayUtcKey() {
  return new Date().toISOString().slice(0, 10)
}

export function addUtcDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Inclusive day count between two yyyy-mm-dd keys. */
export function inclusiveDaySpan(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`)
  const b = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return Math.floor((b - a) / 86400000) + 1
}

export type DateRangeOk = {
  ok: true
  from: string
  to: string
  days: number
}

export type DateRangeErr = {
  ok: false
  error: 'invalid_date' | 'invalid_range' | 'range_too_long'
}

/**
 * Resolve a query window.
 * - Prefer dateFrom/dateTo when either is present
 * - Else use days (default 30, max 365)
 */
export function resolveDateRange(input: {
  days?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  defaultDays?: number
  maxDays?: number
}): DateRangeOk | DateRangeErr {
  const maxDays = input.maxDays ?? MAX_RANGE_DAYS
  const defaultDays = input.defaultDays ?? DEFAULT_RANGE_DAYS
  const to = todayUtcKey()

  const hasFrom = Boolean(input.dateFrom?.trim())
  const hasTo = Boolean(input.dateTo?.trim())

  if (hasFrom || hasTo) {
    const from = (input.dateFrom || '').trim() || addUtcDays(to, -(defaultDays - 1))
    const end = (input.dateTo || '').trim() || to
    if (!DAY_RE.test(from) || !DAY_RE.test(end)) {
      return { ok: false, error: 'invalid_date' }
    }
    if (from > end) return { ok: false, error: 'invalid_range' }
    const days = inclusiveDaySpan(from, end)
    if (!Number.isFinite(days) || days < 1) {
      return { ok: false, error: 'invalid_range' }
    }
    if (days > maxDays) return { ok: false, error: 'range_too_long' }
    return { ok: true, from, to: end, days }
  }

  let days = defaultDays
  if (input.days != null && String(input.days).trim() !== '') {
    const n = Number(input.days)
    if (!Number.isFinite(n) || n < 1) return { ok: false, error: 'invalid_range' }
    days = Math.floor(n)
  }
  if (days > maxDays) return { ok: false, error: 'range_too_long' }

  return {
    ok: true,
    from: addUtcDays(to, -(days - 1)),
    to,
    days,
  }
}

export function inDateRange(
  iso: string,
  from: string,
  to: string,
): boolean {
  const day = iso.slice(0, 10)
  return day >= from && day <= to
}

export function buildDayKeys(from: string, to: string): string[] {
  const keys: string[] = []
  let cur = from
  while (cur <= to) {
    keys.push(cur)
    cur = addUtcDays(cur, 1)
  }
  return keys
}
