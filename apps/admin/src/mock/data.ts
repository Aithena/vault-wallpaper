/** 静态页演示数据，后续联调时替换为 API */

export const mockUsers = [
  {
    id: 'u1',
    email: 'alice@example.com',
    memberTier: 'max',
    memberStatus: 'active',
    memberExpiresAt: '2027-03-01T00:00:00.000Z',
    createdAt: '2026-01-12T08:20:00.000Z',
    accountStatus: 'active',
    blacklisted: false,
  },
  {
    id: 'u2',
    email: 'bob@example.com',
    memberTier: 'pro',
    memberStatus: 'active',
    memberExpiresAt: '2026-12-20T00:00:00.000Z',
    createdAt: '2026-02-03T11:00:00.000Z',
    accountStatus: 'active',
    blacklisted: false,
  },
  {
    id: 'u3',
    email: 'carol@example.com',
    memberTier: null,
    memberStatus: null,
    memberExpiresAt: null,
    createdAt: '2026-05-18T16:40:00.000Z',
    accountStatus: 'disabled',
    blacklisted: false,
  },
  {
    id: 'u4',
    email: 'dave@example.com',
    memberTier: 'basic',
    memberStatus: 'active',
    memberExpiresAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-04-02T09:10:00.000Z',
    accountStatus: 'active',
    blacklisted: true,
  },
]

export const mockBlacklist = [
  {
    id: 'bl1',
    email: 'dave@example.com',
    reason: '异常批量下载',
    createdAt: '2026-07-01T10:00:00.000Z',
    operator: 'admin',
  },
]

export const mockWallpapers = [
  {
    id: 'wp-aurora',
    title: '极光山脊',
    previewUrl: 'https://picsum.photos/seed/vault-aurora/160/100',
    status: 'published',
    tierRequired: 'free',
    category: '自然',
    tags: ['极光', '山'],
    width: 3840,
    height: 2160,
    hasOriginal: true,
    updatedAt: '2026-08-01T12:00:00.000Z',
  },
  {
    id: 'wp-harbor',
    title: '雾港清晨',
    previewUrl: 'https://picsum.photos/seed/vault-harbor/160/100',
    status: 'pending',
    tierRequired: 'pro',
    category: '城市',
    tags: ['海港', '雾'],
    width: 3840,
    height: 2160,
    hasOriginal: true,
    updatedAt: '2026-08-05T09:30:00.000Z',
  },
  {
    id: 'wp-neon',
    title: '夜城霓虹',
    previewUrl: 'https://picsum.photos/seed/vault-neon/160/100',
    status: 'rejected',
    tierRequired: 'max',
    category: '城市',
    tags: ['夜景', '霓虹'],
    width: 3840,
    height: 2160,
    hasOriginal: false,
    updatedAt: '2026-08-06T18:00:00.000Z',
    rejectReason: '原图缺失',
  },
  {
    id: 'wp-mist',
    title: '林间薄雾',
    previewUrl: 'https://picsum.photos/seed/vault-mist/160/100',
    status: 'unpublished',
    tierRequired: 'basic',
    category: '自然',
    tags: ['森林'],
    width: 2560,
    height: 1440,
    hasOriginal: true,
    updatedAt: '2026-07-28T14:20:00.000Z',
  },
]

export const mockCategories = [
  { id: 'c1', name: '自然', slug: 'nature', wallpaperCount: 2, sort: 1, updatedAt: '2026-07-01' },
  { id: 'c2', name: '城市', slug: 'city', wallpaperCount: 2, sort: 2, updatedAt: '2026-07-02' },
  { id: 'c3', name: '抽象', slug: 'abstract', wallpaperCount: 0, sort: 3, updatedAt: '2026-07-03' },
]

export const mockTags = [
  { id: 't1', name: '极光', slug: 'aurora', wallpaperCount: 1, updatedAt: '2026-07-01' },
  { id: 't2', name: '夜景', slug: 'night', wallpaperCount: 1, updatedAt: '2026-07-02' },
  { id: 't3', name: '海港', slug: 'harbor', wallpaperCount: 1, updatedAt: '2026-07-03' },
]

export const mockDownloads = [
  {
    id: 'd1',
    email: 'alice@example.com',
    wallpaperId: 'wp-aurora',
    wallpaperTitle: '极光山脊',
    tierAtTime: 'max',
    success: true,
    createdAt: '2026-08-06T10:12:00.000Z',
  },
  {
    id: 'd2',
    email: 'bob@example.com',
    wallpaperId: 'wp-harbor',
    wallpaperTitle: '雾港清晨',
    tierAtTime: 'pro',
    success: false,
    createdAt: '2026-08-06T11:05:00.000Z',
  },
]

export const mockOrders = [
  {
    id: 'ord_1001',
    email: 'alice@example.com',
    type: 'paid',
    tier: 'max',
    amount: '29.90',
    status: 'paid',
    createdAt: '2026-03-01T08:00:00.000Z',
    paidAt: '2026-03-01T08:01:20.000Z',
  },
  {
    id: 'ord_1002',
    email: 'bob@example.com',
    type: 'free',
    tier: 'free',
    amount: '0.00',
    status: 'paid',
    createdAt: '2026-02-03T11:05:00.000Z',
    paidAt: '2026-02-03T11:05:00.000Z',
  },
  {
    id: 'ord_1003',
    email: 'carol@example.com',
    type: 'mock',
    tier: 'basic',
    amount: '9.90',
    status: 'paid',
    createdAt: '2026-05-18T17:00:00.000Z',
    paidAt: '2026-05-18T17:00:10.000Z',
  },
  {
    id: 'ord_1004',
    email: 'dave@example.com',
    type: 'admin_grant',
    tier: 'basic',
    amount: '0.00',
    status: 'paid',
    createdAt: '2026-07-15T09:00:00.000Z',
    paidAt: '2026-07-15T09:00:00.000Z',
  },
  {
    id: 'ord_1005',
    email: 'eve@example.com',
    type: 'paid',
    tier: 'pro',
    amount: '19.90',
    status: 'pending',
    createdAt: '2026-08-06T20:00:00.000Z',
    paidAt: null,
  },
]

export const mockAnnouncements = [
  {
    id: 'a1',
    title: '会员权益调整说明',
    status: 'published',
    updatedAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'a2',
    title: '系统维护通知（草稿）',
    status: 'draft',
    updatedAt: '2026-08-01T15:00:00.000Z',
  },
]

export const mockAdmins = [
  {
    id: 'adm1',
    username: 'admin',
    email: 'admin@awall.cc',
    name: '超级管理员',
    role: 'super',
    status: 'active',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'adm2',
    username: 'ops',
    email: 'ops@awall.cc',
    name: '运营小王',
    role: 'ops',
    status: 'active',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
]

export const mockAuditLogs = [
  {
    id: 'log1',
    at: '2026-08-06T21:00:00.000Z',
    admin: 'admin',
    action: 'wallpaper.approve',
    target: 'wallpaper:wp-aurora',
  },
  {
    id: 'log2',
    at: '2026-08-06T20:40:00.000Z',
    admin: 'ops',
    action: 'user.disable',
    target: 'user:u3',
  },
  {
    id: 'log3',
    at: '2026-08-05T09:10:00.000Z',
    admin: 'admin',
    action: 'category.create',
    target: 'category:c3',
  },
]

export const mockTiers = [
  { id: 'free', label: '免费', priceYuan: '0.00', onSale: true, benefit: '可浏览；极有限下载' },
  { id: 'basic', label: '基础', priceYuan: '9.90', onSale: true, benefit: '基础档壁纸下载（365 天）' },
  { id: 'pro', label: '进阶', priceYuan: '19.90', onSale: true, benefit: '进阶档及以下（365 天）' },
  { id: 'max', label: '全能', priceYuan: '29.90', onSale: true, benefit: '全部壁纸（365 天）' },
]
