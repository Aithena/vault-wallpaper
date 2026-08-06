import {
  MEMBERSHIP_TIERS,
  type MembershipTierId,
  type WallpaperPublic,
} from '@vault/shared'

/** Seed catalog for local experiment before admin upload exists. */
export const SEED_WALLPAPERS: WallpaperPublic[] = [
  {
    id: 'wp-aurora',
    title: '极光山脊',
    previewUrl: 'https://picsum.photos/seed/vault-aurora/640/360',
    width: 3840,
    height: 2160,
    tierRequired: 'free',
  },
  {
    id: 'wp-harbor',
    title: '雾港清晨',
    previewUrl: 'https://picsum.photos/seed/vault-harbor/640/360',
    width: 3840,
    height: 2160,
    tierRequired: 'pro',
  },
  {
    id: 'wp-neon',
    title: '夜城霓虹',
    previewUrl: 'https://picsum.photos/seed/vault-neon/640/360',
    width: 3840,
    height: 2160,
    tierRequired: 'max',
  },
]

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
