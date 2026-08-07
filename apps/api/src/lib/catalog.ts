import {
  MEMBERSHIP_TIERS,
  type MembershipTierId,
  type WallpaperPublic,
} from '@vault/shared'

/** @deprecated Prefer KV catalog; kept for tier helpers only. */
export const SEED_WALLPAPERS: WallpaperPublic[] = []

const TIER_RANK: Record<MembershipTierId, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  max: 3,
}

export function canAccessTier(
  userTier: MembershipTierId | null,
  required: MembershipTierId,
): boolean {
  if (!userTier) return false
  return TIER_RANK[userTier] >= TIER_RANK[required]
}

export function resolveTierPrice(tier: MembershipTierId): string {
  return MEMBERSHIP_TIERS[tier].priceYuan
}

export function isMembershipTierId(value: string): value is MembershipTierId {
  return value in MEMBERSHIP_TIERS
}
