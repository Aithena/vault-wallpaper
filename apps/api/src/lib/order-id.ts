/** Order id: yyyyMMddHHmmss + 4 hex (Asia/Shanghai), e.g. 20260807003612A3F9 */
export function generateOrderId(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || '00'

  const time =
    `${get('year')}${get('month')}${get('day')}` +
    `${get('hour')}${get('minute')}${get('second')}`

  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `${time}${rand}`
}
