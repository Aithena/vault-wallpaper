/** Membership tiers — prices are source of truth on the server. */
export const MEMBERSHIP_TIERS = {
  free: { id: 'free', label: '免费', priceYuan: '0.00' },
  basic: { id: 'basic', label: '基础', priceYuan: '9.90' },
  pro: { id: 'pro', label: '进阶', priceYuan: '19.90' },
  max: { id: 'max', label: '全能', priceYuan: '29.90' },
} as const

export type MembershipTierId = keyof typeof MEMBERSHIP_TIERS

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
  /** Public low-res / watermarked preview URL */
  previewUrl: string
  width: number
  height: number
  tierRequired: MembershipTierId
}

export type SessionUser = {
  id: string
  email: string
  memberTier: MembershipTierId | null
  memberStatus: MemberStatus | null
}
