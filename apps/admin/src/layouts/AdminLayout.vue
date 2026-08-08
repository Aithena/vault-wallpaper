<template>
  <div class="admin-layout">
    <header class="area-a">
      <div class="a-left">
        <div class="brand">
          <img class="brand-logo" src="/logo.svg" alt="awall" width="32" height="32" />
        </div>
      </div>
      <div class="a-right">
        <el-popover
          placement="bottom-end"
          :width="360"
          trigger="click"
          @show="loadNotificationPanel"
        >
          <template #reference>
            <el-badge :value="notifBadge" :hidden="!notifBadge" :max="99">
              <el-button :icon="Bell" circle title="消息" />
            </el-badge>
          </template>
          <div class="notif-panel">
            <div class="notif-head">
              <span>待办提醒</span>
              <el-button
                v-if="notifItems.length"
                link
                type="primary"
                size="small"
                @click.stop="markAllRead"
              >
                全部已读
              </el-button>
            </div>
            <p v-if="pendingCount > 0" class="notif-pending">
              当前仍有 {{ pendingCount }} 张壁纸待审核（角标为未读提醒数）
            </p>
            <div v-loading="notifLoading" class="notif-body">
              <button
                v-for="item in notifItems"
                :key="item.id"
                type="button"
                class="notif-item"
                @click="openNotification(item)"
              >
                <div class="notif-title">{{ item.title }}</div>
                <div class="notif-desc">{{ item.description }}</div>
              </button>
              <p v-if="!notifLoading && !notifItems.length" class="notif-empty">
                {{ pendingCount > 0 ? '暂无未读提醒，待审事项请到壁纸列表处理' : '暂无待办' }}
              </p>
            </div>
          </div>
        </el-popover>
        <el-dropdown trigger="click" @command="onCommand">
          <div class="admin-chip" :title="profile?.realName || undefined">
            <span class="admin-name">{{ profile?.nickName ?? '管理员' }}</span>
            <span class="admin-role">{{ profile?.roleCode ?? '—' }}</span>
            <el-icon><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <div class="area-b">
      <nav class="area-c" aria-label="一级菜单">
        <button
          v-for="group in visibleMenu"
          :key="group.id"
          type="button"
          class="c-item"
          :class="{ active: activeGroup?.id === group.id }"
          @click="onPrimary(group)"
        >
          <el-icon :size="18"><component :is="iconMap[group.icon]" /></el-icon>
          <span style="margin-left: 4px;">{{ group.label }}</span>
        </button>
      </nav>

      <div class="area-d">
        <aside class="area-e" aria-label="二级菜单">
          <el-menu :default-active="activeChildPath" router>
            <el-menu-item
              v-for="child in activeGroup?.children ?? []"
              :key="child.id"
              :index="child.path"
            >
              {{ child.label }}
            </el-menu-item>
          </el-menu>
        </aside>
        <main class="area-f">
          <RouterView />
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  Bell,
  HomeFilled,
  List,
  Picture,
  Search,
  Setting,
  Tools,
  User,
} from '@element-plus/icons-vue'
import {
  defaultPathForGroup,
  filterMenuByPermissions,
  findGroupByPath,
  type AdminMenuGroup,
} from '../config/menu'
import { getAdminProfile, logoutAdmin, refreshAdminMe } from '../lib/auth'
import { adminApi } from '../lib/api'

const iconMap: Record<string, object> = {
  home: HomeFilled,
  users: User,
  image: Picture,
  order: List,
  settings: Setting,
  tools: Tools,
}

type NotifItem = {
  id: string
  type: string
  title: string
  description: string
  count: number
  path: string
}

const route = useRoute()
const router = useRouter()
const profile = ref(getAdminProfile())
const notifBadge = ref(0)
const pendingCount = ref(0)
const notifItems = ref<NotifItem[]>([])
const notifLoading = ref(false)

async function loadNotificationBadge() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return
  }
  try {
    const data = await adminApi<{
      badge: number
      unread?: number
      counts?: { pending: number }
    }>('/api/admin/dashboard/notifications?mode=badge')
    notifBadge.value = data.unread ?? 0
    pendingCount.value = data.counts?.pending ?? data.badge ?? 0
  } catch {
    /* keep previous badge on transient errors */
  }
}

async function loadNotificationPanel() {
  notifLoading.value = true
  try {
    const data = await adminApi<{
      badge: number
      unread?: number
      items: NotifItem[]
      counts?: { pending: number }
    }>('/api/admin/dashboard/notifications?mode=full')
    notifBadge.value = data.unread ?? data.items.length
    pendingCount.value = data.counts?.pending ?? data.badge ?? 0
    notifItems.value = data.items
  } catch {
    notifBadge.value = 0
    pendingCount.value = 0
    notifItems.value = []
  } finally {
    notifLoading.value = false
  }
}

async function openNotification(item: NotifItem) {
  try {
    await adminApi(`/api/admin/dashboard/notifications/${item.id}/read`, {
      method: 'POST',
    })
  } catch {
    /* still navigate */
  }
  notifItems.value = notifItems.value.filter((x) => x.id !== item.id)
  notifBadge.value = Math.max(0, notifBadge.value - 1)
  void router.push(item.path)
}

async function markAllRead() {
  try {
    await adminApi('/api/admin/dashboard/notifications/read-all', {
      method: 'POST',
    })
    notifItems.value = []
    notifBadge.value = 0
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void refreshAdminMe().then((admin) => {
    if (admin) profile.value = admin
  })
  void loadNotificationBadge()
  const timer = window.setInterval(() => {
    void loadNotificationBadge()
  }, 5 * 60_000)
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void loadNotificationBadge()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onUnmounted(() => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })
})

const visibleMenu = computed(() => filterMenuByPermissions(profile.value?.menus))

const activeGroup = computed(() => {
  const hit = findGroupByPath(route.path)
  if (hit && visibleMenu.value.some((g) => g.id === hit.id)) {
    return (
      visibleMenu.value.find((g) => g.id === hit.id) ?? visibleMenu.value[0]
    )
  }
  return visibleMenu.value[0]
})

const activeChildPath = computed(() => {
  if (route.path.startsWith('/wallpapers')) return '/wallpapers'
  if (route.path === '/users/online') return '/users/online'
  if (route.path === '/users/blacklist') return '/users/blacklist'
  return route.path
})

function onPrimary(group: AdminMenuGroup) {
  if (activeGroup.value?.id === group.id) return
  void router.push(defaultPathForGroup(group.id, profile.value?.menus))
}

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    logoutAdmin()
    void router.push('/login')
  }
}
</script>

<style scoped lang="less">
.admin-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.area-a {
  height: var(--admin-a-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 0;
  background: transparent;
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.a-left,
.a-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: var(--admin-c-width);
}

.brand-logo {
  width: 32px;
  height: 32px;
  display: block;
  border-radius: 8px;
}

.brand-text {
  font-weight: 650;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.quick-search {
  width: 240px;
}

.admin-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--admin-line);
  font-size: 13px;
  cursor: pointer;
}

.admin-name {
  font-weight: 600;
}

.admin-role {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--admin-soft, #f0f2f5);
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.4;
}

.area-b {
  flex: 1;
  display: flex;
  min-height: 0;
}

.area-c {
  width: var(--admin-c-width);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: transparent;
}

.c-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--admin-muted);
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
  &:hover {
    color: var(--admin-text);
  }

  &.active {
    color: var(--admin-accent);
  }
}

.area-d {
  flex: 1;
  display: flex;
  min-width: 0;
  border-radius: 20px 0 0 0;
  background: #ffffff;
  overflow: hidden;
}

.area-e {
  width: var(--admin-e-width);
  padding: 8px 6px;
  background: rgba(255, 255, 255, 0.66);

  :deep(.el-menu) {
    border-right: none;
    background: transparent;
  }

  :deep(.el-menu-item) {
    height: 36px;
    line-height: 36px;
    font-size: 13px;
    padding: 0 12px !important;
    margin: 2px 0;
    border-radius: 8px;
  }
}

.area-f {
  flex: 1;
  min-width: 0;
  padding: 18px 20px 28px;
  overflow: auto;
}

.notif-panel {
  margin: -4px;
}

.notif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 650;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--admin-line);
  margin-bottom: 6px;
}

.notif-pending {
  margin: 0 8px 8px;
  font-size: 12px;
  color: var(--admin-muted);
  line-height: 1.4;
}

.notif-body {
  min-height: 48px;
  max-height: 360px;
  overflow: auto;
}

.notif-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 10px 8px;
  cursor: pointer;

  &:hover {
    background: rgba(27, 36, 48, 0.04);
  }
}

.notif-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--admin-text);
}

.notif-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--admin-muted);
  line-height: 1.4;
}

.notif-empty {
  margin: 16px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--admin-muted);
}
</style>
