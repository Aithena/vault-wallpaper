/** Align with API `resolveDateRange`: default 30 days, max 365 inclusive. */

export const DEFAULT_RANGE_DAYS = 30
export const MAX_RANGE_DAYS = 365

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Local calendar yyyy-mm-dd (matches Element Plus value-format). */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addLocalDays(d: Date, delta: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  next.setDate(next.getDate() + delta)
  return next
}

/** Inclusive default window ending today. */
export function defaultDateRange(
  days = DEFAULT_RANGE_DAYS,
): [string, string] {
  const to = new Date()
  const from = addLocalDays(to, -(days - 1))
  return [formatLocalDate(from), formatLocalDate(to)]
}

export function inclusiveDaySpan(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`)
  const b = Date.parse(`${to}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return Math.floor((b - a) / 86400000) + 1
}

/**
 * Element Plus daterange `disabled-date` helper.
 * Pass the first picked date from `@calendar-change`.
 */
export function makeRangeDisabledDate(
  getAnchor: () => Date | null | undefined,
  maxDays = MAX_RANGE_DAYS,
) {
  const spanMs = (maxDays - 1) * 86400000
  return (time: Date) => {
    const anchor = getAnchor()
    if (!anchor) return false
    const t = time.getTime()
    const a = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
    ).getTime()
    return t < a - spanMs || t > a + spanMs
  }
}

export function isDateRangeTooLong(
  range: [string, string] | null | undefined,
  maxDays = MAX_RANGE_DAYS,
): boolean {
  if (!range?.[0] || !range?.[1]) return false
  const days = inclusiveDaySpan(range[0], range[1])
  return Number.isFinite(days) && days > maxDays
}
