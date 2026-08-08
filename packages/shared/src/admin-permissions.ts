/** Admin RBAC: menu + button permission tree (shared by API & admin UI). */

export type DataScope = 'all' | 'self'
export type AdminDataScopeOverride = 'follow_role' | 'all' | 'self'

export type PermissionButton = {
  key: string
  label: string
}

export type PermissionMenu = {
  key: string
  label: string
  path: string
  /** 无个人归属的数据模块：强制 all */
  dataScopeForcedAll?: boolean
  buttons: PermissionButton[]
}

export type PermissionGroup = {
  key: string
  label: string
  icon: string
  menus: PermissionMenu[]
}

export const ADMIN_PERMISSION_TREE: PermissionGroup[] = [
  {
    key: 'dashboard',
    label: '首页看板',
    icon: 'home',
    menus: [
      {
        key: 'dashboard.overview',
        label: '数据总览',
        path: '/dashboard',
        dataScopeForcedAll: true,
        buttons: [],
      },
    ],
  },
  {
    key: 'wallpapers',
    label: '壁纸资源',
    icon: 'image',
    menus: [
      {
        key: 'wallpapers.list',
        label: '壁纸列表',
        path: '/wallpapers',
        buttons: [
          { key: 'wallpapers.list.upload', label: '上传' },
          { key: 'wallpapers.list.approve', label: '审核通过' },
          { key: 'wallpapers.list.reject', label: '驳回' },
          { key: 'wallpapers.list.unpublish', label: '下架' },
          { key: 'wallpapers.list.edit', label: '编辑' },
          { key: 'wallpapers.list.delete', label: '删除' },
          { key: 'wallpapers.list.batch', label: '批量操作' },
          { key: 'wallpapers.list.ai', label: 'AI 识别' },
        ],
      },
      {
        key: 'wallpapers.categories',
        label: '分类管理',
        path: '/categories',
        buttons: [
          { key: 'wallpapers.categories.create', label: '新增' },
          { key: 'wallpapers.categories.edit', label: '编辑' },
          { key: 'wallpapers.categories.delete', label: '删除' },
        ],
      },
      {
        key: 'wallpapers.tags',
        label: '标签管理',
        path: '/tags',
        buttons: [
          { key: 'wallpapers.tags.create', label: '新增' },
          { key: 'wallpapers.tags.edit', label: '编辑' },
          { key: 'wallpapers.tags.delete', label: '删除' },
        ],
      },
      {
        key: 'wallpapers.downloads',
        label: '下载记录',
        path: '/downloads',
        dataScopeForcedAll: true,
        buttons: [],
      },
    ],
  },
  {
    key: 'users',
    label: '用户会员',
    icon: 'users',
    menus: [
      {
        key: 'users.list',
        label: '用户列表',
        path: '/users',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'users.list.edit', label: '编辑资料' },
          { key: 'users.list.logs', label: '操作日志' },
          { key: 'users.list.renew', label: '手动续费' },
          { key: 'users.list.disable', label: '禁用/解封' },
        ],
      },
      {
        key: 'users.online',
        label: '在线用户',
        path: '/users/online',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'users.blacklist',
        label: '黑名单管理',
        path: '/users/blacklist',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'users.blacklist.create', label: '新增拉黑' },
          { key: 'users.blacklist.remove', label: '解除拉黑' },
        ],
      },
    ],
  },
  {
    key: 'orders',
    label: '订单财务',
    icon: 'order',
    menus: [
      {
        key: 'orders.list',
        label: '全部订单',
        path: '/orders',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'orders.list.export', label: '导出' },
          { key: 'orders.list.regrant', label: '补发权限' },
          { key: 'orders.list.refund', label: '标记退款' },
          { key: 'orders.list.callback', label: '查看回调' },
        ],
      },
      {
        key: 'orders.finance',
        label: '财务统计',
        path: '/finance',
        dataScopeForcedAll: true,
        buttons: [],
      },
    ],
  },
  {
    key: 'settings',
    label: '站点配置',
    icon: 'settings',
    menus: [
      {
        key: 'settings.site',
        label: '基础配置',
        path: '/settings/site',
        dataScopeForcedAll: true,
        buttons: [{ key: 'settings.site.save', label: '保存' }],
      },
      {
        key: 'settings.tiers',
        label: '会员套餐',
        path: '/settings/tiers',
        dataScopeForcedAll: true,
        buttons: [{ key: 'settings.tiers.save', label: '保存' }],
      },
      {
        key: 'settings.announcements',
        label: '公告管理',
        path: '/settings/announcements',
        buttons: [
          { key: 'settings.announcements.create', label: '新增' },
          { key: 'settings.announcements.edit', label: '编辑' },
          { key: 'settings.announcements.delete', label: '删除' },
        ],
      },
      {
        key: 'settings.admins',
        label: '员工管理',
        path: '/settings/admins',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'settings.admins.create', label: '新增' },
          { key: 'settings.admins.edit', label: '编辑' },
          { key: 'settings.admins.password', label: '改密码' },
          { key: 'settings.admins.email', label: '绑定邮箱' },
          { key: 'settings.admins.disable', label: '启用/禁用' },
        ],
      },
      {
        key: 'settings.roles',
        label: '角色管理',
        path: '/settings/roles',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'settings.roles.create', label: '新增' },
          { key: 'settings.roles.edit', label: '编辑' },
          { key: 'settings.roles.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'tools',
    label: '系统工具',
    icon: 'tools',
    menus: [
      {
        key: 'tools.cloudflare',
        label: 'Cloudflare',
        path: '/tools/cloudflare',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.r2',
        label: 'R2存储',
        path: '/tools/r2',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.resend',
        label: 'Resend邮件',
        path: '/tools/resend',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.pay',
        label: '支付配置',
        path: '/tools/pay',
        dataScopeForcedAll: true,
        buttons: [
          { key: 'tools.pay.save', label: '保存' },
          { key: 'tools.pay.test', label: '支付测试' },
        ],
      },
      {
        key: 'tools.audit',
        label: '操作日志',
        path: '/tools/audit',
        buttons: [],
      },
      {
        key: 'tools.integration_logs',
        label: '接口日志',
        path: '/tools/integration-logs',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.ai_usage',
        label: 'AI使用统计',
        path: '/tools/ai-usage',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.visitors',
        label: '访客统计',
        path: '/tools/visitors',
        dataScopeForcedAll: true,
        buttons: [],
      },
      {
        key: 'tools.jobs',
        label: '任务监控',
        path: '/tools/jobs',
        dataScopeForcedAll: true,
        buttons: [],
      },
    ],
  },
]

export const SYSTEM_ROLE_SUPER_ID = 'role_super'
export const SYSTEM_ROLE_OPS_ID = 'role_ops'

export function listAllMenuKeys(): string[] {
  return ADMIN_PERMISSION_TREE.flatMap((g) => g.menus.map((m) => m.key))
}

export function listAllButtonKeys(): string[] {
  return ADMIN_PERMISSION_TREE.flatMap((g) =>
    g.menus.flatMap((m) => m.buttons.map((b) => b.key)),
  )
}

export function findMenuByPath(path: string): PermissionMenu | undefined {
  const normalized = path.split('?')[0] ?? path
  for (const g of ADMIN_PERMISSION_TREE) {
    for (const m of g.menus) {
      if (
        normalized === m.path ||
        (m.path !== '/' && normalized.startsWith(`${m.path}/`))
      ) {
        return m
      }
    }
  }
  return undefined
}

export function findMenuByKey(key: string): PermissionMenu | undefined {
  for (const g of ADMIN_PERMISSION_TREE) {
    const hit = g.menus.find((m) => m.key === key)
    if (hit) return hit
  }
  return undefined
}

export type RolePublic = {
  id: string
  name: string
  code: string
  remark: string
  menus: string[]
  buttons: string[]
  dataScope: DataScope
  system: boolean
  adminCount?: number
  createdAt: string
  updatedAt: string
}

export const ADMIN_STATUS = {
  active: 'active',
  disabled: 'disabled',
} as const

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS]

/** @deprecated 兼容旧字段；新逻辑用 roleId */
export const ADMIN_ROLES = {
  /** legacy admin.role value; role code is now `admin` */
  super: 'super',
  ops: 'ops',
} as const

/** @deprecated */
export type AdminRole = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES]

export type AdminPublic = {
  id: string
  username: string
  /** 昵称（界面展示） */
  nickName: string
  /** 真实姓名 */
  realName: string
  email: string | null
  roleId: string
  roleName: string
  roleCode: string
  /** 管理员侧数据权限覆盖 */
  dataScope: AdminDataScopeOverride
  status: AdminStatus
  createdAt: string
  updatedAt: string
  /** 登录 /me 时附带 */
  menus?: string[]
  buttons?: string[]
  effectiveDataScope?: DataScope
}
