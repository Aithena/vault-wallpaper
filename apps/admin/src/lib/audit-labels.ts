import { ADMIN_PERMISSION_TREE } from '@vault/shared'

/** Extra audit action labels not covered by RBAC button keys. */
const EXTRA_ACTION_LABELS: Record<string, string> = {
  'wallpapers.list.upload_original': '壁纸列表 · 上传原图',
  'wallpapers.list.upload_preview': '壁纸列表 · 上传预览',
  'wallpapers.list.ai_apply': '壁纸列表 · 采用 AI 建议',
  'wallpapers.list.resubmit': '壁纸列表 · 重新提交审核',
  'wallpapers.list.batch.approve': '壁纸列表 · 批量通过',
  'wallpapers.list.batch.reject': '壁纸列表 · 批量驳回',
  'wallpapers.list.batch.unpublish': '壁纸列表 · 批量下架',
  'wallpapers.list.batch.delete': '壁纸列表 · 批量删除',
  'settings.site.save': '站点设置 · 保存',
  'settings.tiers.save': '会员档位 · 保存',
  'settings.announcements.create': '公告管理 · 新增',
  'settings.announcements.edit': '公告管理 · 编辑',
  'settings.announcements.delete': '公告管理 · 删除',
  'users.blacklist.create': '黑名单 · 拉黑',
  'users.blacklist.remove': '黑名单 · 解除',
  'orders.list.export': '订单列表 · 导出',
  'orders.list.regrant': '订单列表 · 补发权益',
  'orders.list.refund': '订单列表 · 标记退款',
}

const TARGET_KIND_LABELS: Record<string, string> = {
  wallpaper: '壁纸',
  category: '分类',
  tag: '标签',
  user: '用户',
  order: '订单',
  site: '站点',
  tiers: '会员档位',
  announcement: '公告',
  role: '角色',
  admin: '员工',
}

function buildPermissionActionLabels(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const group of ADMIN_PERMISSION_TREE) {
    for (const menu of group.menus) {
      map[menu.key] = menu.label
      for (const btn of menu.buttons) {
        map[btn.key] = `${menu.label} · ${btn.label}`
      }
    }
  }
  return map
}

const PERMISSION_ACTION_LABELS = buildPermissionActionLabels()

/** Human-readable audit action (falls back to raw key). */
export function formatAuditAction(action: string): string {
  if (!action) return '—'
  if (EXTRA_ACTION_LABELS[action]) return EXTRA_ACTION_LABELS[action]
  if (PERMISSION_ACTION_LABELS[action]) return PERMISSION_ACTION_LABELS[action]

  // batch.* already handled; try prefix match for wallpapers.list.batch.xxx
  const batch = action.match(/^(.+)\.batch\.(.+)$/)
  if (batch) {
    const base = PERMISSION_ACTION_LABELS[`${batch[1]}.batch`] || PERMISSION_ACTION_LABELS[batch[1]]
    if (base) return `${base} · ${batch[2]}`
  }

  return action
}

/** Human-readable audit target (e.g. wallpaper:xxx → 壁纸 xxx). */
export function formatAuditTarget(target: string): string {
  if (!target) return '—'
  const idx = target.indexOf(':')
  if (idx <= 0) return target
  const kind = target.slice(0, idx)
  const id = target.slice(idx + 1)
  const kindLabel = TARGET_KIND_LABELS[kind] || kind
  if (id === 'config') return kindLabel === kind ? `${kindLabel}配置` : kindLabel
  return `${kindLabel} ${id}`
}
