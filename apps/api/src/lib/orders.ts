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

function normalizeOrder(order: OrderRecord): OrderRecord {
  if (!order.type) {
    if (order.totalFee === '0.00' || order.totalFee === '0') order.type = 'free'
    else order.type = 'paid'
  }
  return order
}

export async function getOrder(
  kv: KVNamespace,
  id: string,
): Promise<OrderRecord | null> {
  const raw = await kv.get(`order:${id}`)
  if (!raw) return null
  return normalizeOrder(JSON.parse(raw) as OrderRecord)
}

export async function listOrders(kv: KVNamespace): Promise<OrderRecord[]> {
  const rows: OrderRecord[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix: 'order:', cursor, limit: 1000 })
    for (const key of page.keys) {
      const raw = await kv.get(key.name)
      if (!raw) continue
      rows.push(normalizeOrder(JSON.parse(raw) as OrderRecord))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return rows
}

export async function listOrdersByUser(
  kv: KVNamespace,
  userId: string,
  limit = 20,
): Promise<OrderRecord[]> {
  const all = await listOrders(kv)
  return all.filter((o) => o.userId === userId).slice(0, limit)
}

export async function saveOrder(kv: KVNamespace, order: OrderRecord): Promise<void> {
  await kv.put(`order:${order.id}`, JSON.stringify(order))
}
