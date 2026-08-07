import { reactive, ref } from 'vue'
import type { MembershipTierId } from '@vault/shared'
import { MEMBERSHIP_TIERS } from '@vault/shared'
import { api } from './api'

export type PublicSiteConfig = {
  siteName: string
  domain: string
  purchaseNotice: string
  copyright: string
  purchaseEnabled: boolean
}

export type PublicTier = {
  id: MembershipTierId
  label: string
  priceYuan: string
  onSale: boolean
  benefit: string
}

export type PublicAnnouncement = {
  id: string
  title: string
  content: string
  updatedAt: string
}

export const siteState = reactive({
  loaded: false,
  config: {
    siteName: 'awall',
    domain: 'awall.cc',
    purchaseNotice: '',
    copyright: '© awall. All rights reserved.',
    purchaseEnabled: true,
  } as PublicSiteConfig,
  tiers: Object.values(MEMBERSHIP_TIERS).map((t) => ({
    id: t.id as MembershipTierId,
    label: t.label,
    priceYuan: t.priceYuan,
    onSale: true,
    benefit: '',
  })) as PublicTier[],
  announcements: [] as PublicAnnouncement[],
})

const loading = ref(false)

export async function loadSitePublic() {
  if (loading.value) return
  loading.value = true
  try {
    const [site, tiers, announcements] = await Promise.all([
      api<{ config: PublicSiteConfig }>('/api/site'),
      api<{ tiers: PublicTier[] }>('/api/site/tiers'),
      api<{ announcements: PublicAnnouncement[] }>('/api/site/announcements'),
    ])
    siteState.config = site.config
    if (tiers.tiers?.length) siteState.tiers = tiers.tiers
    siteState.announcements = announcements.announcements || []
    siteState.loaded = true
    if (typeof document !== 'undefined' && site.config.siteName) {
      document.title = site.config.siteName
    }
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

export function tierLabel(id: MembershipTierId | string | null | undefined) {
  if (!id) return '—'
  const hit = siteState.tiers.find((t) => t.id === id)
  if (hit) return hit.label
  if (id in MEMBERSHIP_TIERS) {
    return MEMBERSHIP_TIERS[id as MembershipTierId].label
  }
  return String(id)
}
