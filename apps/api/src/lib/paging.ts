export type PageQuery = {
  page: number
  pageSize: number
}

export function parsePageQuery(
  query: { page?: string; pageSize?: string; limit?: string },
  defaults: { pageSize?: number; maxPageSize?: number } = {},
): PageQuery {
  const max = defaults.maxPageSize ?? 100
  const defaultSize = defaults.pageSize ?? 20
  let page = Number(query.page || '1')
  let pageSize = Number(query.pageSize || query.limit || String(defaultSize))
  if (!Number.isFinite(page) || page < 1) page = 1
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultSize
  pageSize = Math.min(Math.floor(pageSize), max)
  page = Math.floor(page)
  return { page, pageSize }
}

export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; page: number; pageSize: number } {
  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  }
}
