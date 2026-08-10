/** Membership tiers — prices are source of truth on the server. */
export const MEMBERSHIP_TIERS = {
  free: { id: 'free', label: '免费', priceYuan: '0.00' },
  basic: { id: 'basic', label: '基础', priceYuan: '9.90' },
  pro: { id: 'pro', label: '进阶', priceYuan: '19.90' },
  max: { id: 'max', label: '全能', priceYuan: '29.90' },
} as const

export type MembershipTierId = keyof typeof MEMBERSHIP_TIERS

/** Each purchase / renew adds this many days. */
export const MEMBERSHIP_DAYS = 365

export const ORDER_STATUS = {
  pending: 'pending',
  paid: 'paid',
  refunded: 'refunded',
} as const

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

export const MEMBER_STATUS = {
  active: 'active',
  disabled: 'disabled',
} as const

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS]

export type WallpaperPublic = {
  id: string
  title: string
  /** Full-size preview URL */
  previewUrl: string
  /** Longest edge ≤ 100px (list thumbnails) */
  thumbUrl?: string
  /** Longest edge ≤ 500px (cards / grid) */
  mediumUrl?: string
  width: number
  height: number
  tierRequired: MembershipTierId
}

export type SessionUser = {
  id: string
  email: string
  memberTier: MembershipTierId | null
  memberStatus: MemberStatus | null
  /** ISO expiry time; membership valid only before this instant. */
  memberExpiresAt: string | null
}

export function isMembershipValid(user: {
  memberStatus: MemberStatus | null
  memberExpiresAt: string | null
}): boolean {
  if (user.memberStatus !== 'active' || !user.memberExpiresAt) return false
  const exp = Date.parse(user.memberExpiresAt)
  return Number.isFinite(exp) && exp > Date.now()
}

export * from './admin-permissions'
