export type SiteConfig = {
  siteName: string
  domain: string
  purchaseNotice: string
  copyright: string
  purchaseEnabled: boolean
  updatedAt: string
}

const KEY = 'site:config'

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteName: 'awall',
  domain: 'awall.cc',
  purchaseNotice: '会员按年计费，开通后可在有效期内按档位下载对应壁纸。',
  copyright: '© awall. All rights reserved.',
  purchaseEnabled: true,
  updatedAt: new Date(0).toISOString(),
}

export async function getSiteConfig(kv: KVNamespace): Promise<SiteConfig> {
  const raw = await kv.get(KEY)
  if (!raw) return { ...DEFAULT_SITE_CONFIG }
  return { ...DEFAULT_SITE_CONFIG, ...(JSON.parse(raw) as SiteConfig) }
}

export async function saveSiteConfig(
  kv: KVNamespace,
  patch: Partial<Omit<SiteConfig, 'updatedAt'>>,
): Promise<SiteConfig> {
  const current = await getSiteConfig(kv)
  const next: SiteConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await kv.put(KEY, JSON.stringify(next))
  return next
}
