import { MEMBERSHIP_TIERS, type MembershipTierId } from '@vault/shared'

export type TierConfigItem = {
  id: MembershipTierId
  label: string
  priceYuan: string
  onSale: boolean
  benefit: string
}

const KEY = 'site:tiers'

const DEFAULT_BENEFITS: Record<MembershipTierId, string> = {
  free: '可浏览；极有限下载',
  basic: '基础档壁纸下载（365 天）',
  pro: '进阶档及以下（365 天）',
  max: '全部壁纸（365 天）',
}

export function defaultTiers(): TierConfigItem[] {
  return (Object.keys(MEMBERSHIP_TIERS) as MembershipTierId[]).map((id) => ({
    id,
    label: MEMBERSHIP_TIERS[id].label,
    priceYuan: MEMBERSHIP_TIERS[id].priceYuan,
    onSale: true,
    benefit: DEFAULT_BENEFITS[id],
  }))
}

export async function getTierConfigs(kv: KVNamespace): Promise<TierConfigItem[]> {
  const raw = await kv.get(KEY)
  if (!raw) return defaultTiers()
  try {
    const parsed = JSON.parse(raw) as TierConfigItem[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultTiers()
    return parsed
  } catch {
    return defaultTiers()
  }
}

export async function saveTierConfigs(
  kv: KVNamespace,
  tiers: TierConfigItem[],
): Promise<TierConfigItem[]> {
  const allow = new Set(Object.keys(MEMBERSHIP_TIERS))
  const cleaned = tiers.filter((t) => allow.has(t.id))
  await kv.put(KEY, JSON.stringify(cleaned))
  return cleaned
}

export async function resolveConfiguredTierPrice(
  kv: KVNamespace,
  tier: MembershipTierId,
): Promise<string> {
  const tiers = await getTierConfigs(kv)
  const hit = tiers.find((t) => t.id === tier)
  return hit?.priceYuan ?? MEMBERSHIP_TIERS[tier].priceYuan
}
