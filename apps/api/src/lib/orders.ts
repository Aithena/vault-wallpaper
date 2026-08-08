export type OrderRecord = {
  id: string
  userId: string
  tier: string
  totalFee: string
  status: string
  /** paid | free | mock | admin_grant */
  type?: string
  createdAt: string
  paidAt?: string
  /** Last payment notify payload (虎皮椒 etc.) */
  callbackAt?: string
  callbackPayload?: Record<string, string>
  refundedAt?: string
  refundNote?: string
  regrantedAt?: string
}

const INDEX_KEY = 'orders:index'
const INDEX_BUILT_FLAG = 'orders:index_built_v1'
const MAX_INDEX = 5000

function orderKey(id: string) {
  return `order:${id}`
}

function userOrdersKey(userId: string) {
  return `orders:user:${userId}`
}

function normalizeOrder(order: OrderRecord): OrderRecord {
  if (!order.type) {
    if (order.totalFee === '0.00' || order.totalFee === '0') order.type = 'free'
    else order.type = 'paid'
  }
  return order
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

async function writeIndex(kv: KVNamespace, ids: string[]) {
  await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX)))
}

async function ensureOrdersIndex(kv: KVNamespace): Promise<string[]> {
  const built = await kv.get(INDEX_BUILT_FLAG)
  if (built) return readIndex(kv)

  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: 'order:', cursor, limit: 1000 })
    for (const key of page.keys) {
      const id = key.name.slice('order:'.length)
      if (id) ids.push(id)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  ids.reverse() // list is oldest-first from KV; prefer newest-first
  await writeIndex(kv, ids)
  await kv.put(INDEX_BUILT_FLAG, '1')
  return ids
}

async function addToUserIndex(kv: KVNamespace, userId: string, orderId: string) {
  const raw = await kv.get(userOrdersKey(userId))
  let ids: string[] = []
  if (raw) {
    try {
      ids = JSON.parse(raw) as string[]
      if (!Array.isArray(ids)) ids = []
    } catch {
      ids = []
    }
  }
  if (!ids.includes(orderId)) ids.unshift(orderId)
  await kv.put(userOrdersKey(userId), JSON.stringify(ids.slice(0, 100)))
}

export async function getOrder(
  kv: KVNamespace,
  id: string,
): Promise<OrderRecord | null> {
  const raw = await kv.get(orderKey(id))
  if (!raw) return null
  return normalizeOrder(JSON.parse(raw) as OrderRecord)
}

export async function listOrders(kv: KVNamespace): Promise<OrderRecord[]> {
  const ids = await ensureOrdersIndex(kv)
  const rows = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await kv.get(orderKey(id))
        return raw ? normalizeOrder(JSON.parse(raw) as OrderRecord) : null
      }),
    )
  ).filter((r): r is OrderRecord => Boolean(r))
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return rows
}

export async function listOrdersByUser(
  kv: KVNamespace,
  userId: string,
  limit = 20,
): Promise<OrderRecord[]> {
  const raw = await kv.get(userOrdersKey(userId))
  if (raw) {
    try {
      const ids = (JSON.parse(raw) as string[]).slice(0, limit)
      const rows = (
        await Promise.all(
          ids.map(async (id) => {
            const o = await getOrder(kv, id)
            return o && o.userId === userId ? o : null
          }),
        )
      ).filter((r): r is OrderRecord => Boolean(r))
      if (rows.length) return rows
    } catch {
      /* fall through */
    }
  }
  // Legacy fallback once
  const all = await listOrders(kv)
  const mine = all.filter((o) => o.userId === userId).slice(0, limit)
  if (mine.length) {
    await kv.put(
      userOrdersKey(userId),
      JSON.stringify(mine.map((o) => o.id)),
    )
  }
  return mine
}

export async function saveOrder(
  kv: KVNamespace,
  order: OrderRecord,
  opts?: { expirationTtl?: number },
): Promise<void> {
  const prev = await getOrder(kv, order.id)
  const normalized = normalizeOrder(order)
  if (opts?.expirationTtl) {
    await kv.put(orderKey(order.id), JSON.stringify(normalized), {
      expirationTtl: opts.expirationTtl,
    })
  } else {
    await kv.put(orderKey(order.id), JSON.stringify(normalized))
  }

  const ids = await ensureOrdersIndex(kv)
  if (!ids.includes(order.id)) {
    ids.unshift(order.id)
    await writeIndex(kv, ids)
  }
  await addToUserIndex(kv, order.userId, order.id)

  // Dashboard counters (best-effort)
  try {
    const { patchDashboardStats, orderCountsRevenue } = await import(
      './dashboard-stats'
    )
    await patchDashboardStats(kv, (s) => {
      if (!prev) {
        s.ordersTotal += 1
        if (order.status === 'pending') s.ordersPending += 1
        if (order.status === 'paid') {
          s.ordersPaid += 1
          if (orderCountsRevenue(order.type, order.totalFee)) {
            s.revenueTotal += Number(order.totalFee || 0)
          }
        }
        if (order.createdAt.slice(0, 10) === s.day) s.ordersToday += 1
        if (
          order.status === 'paid' &&
          (order.paidAt || order.createdAt).slice(0, 10) === s.day &&
          orderCountsRevenue(order.type, order.totalFee)
        ) {
          s.revenueToday += Number(order.totalFee || 0)
        }
        return
      }

      if (prev.status === 'pending' && order.status !== 'pending') {
        s.ordersPending = Math.max(0, s.ordersPending - 1)
      }
      if (prev.status !== 'pending' && order.status === 'pending') {
        s.ordersPending += 1
      }
      if (prev.status !== 'paid' && order.status === 'paid') {
        s.ordersPaid += 1
        if (orderCountsRevenue(order.type, order.totalFee)) {
          const fee = Number(order.totalFee || 0)
          s.revenueTotal += fee
          if ((order.paidAt || order.createdAt).slice(0, 10) === s.day) {
            s.revenueToday += fee
          }
        }
      }
      if (prev.status === 'paid' && order.status !== 'paid') {
        s.ordersPaid = Math.max(0, s.ordersPaid - 1)
        if (orderCountsRevenue(prev.type, prev.totalFee)) {
          s.revenueTotal = Math.max(
            0,
            s.revenueTotal - Number(prev.totalFee || 0),
          )
        }
      }
    })
  } catch {
    /* stats must not break orders */
  }
}
