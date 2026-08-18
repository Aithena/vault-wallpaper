<template>
  <div class="admin-layout">
    <header class="area-a">
      <div class="a-left">
        <div class="brand">
          <img class="brand-logo" src="/logo.svg" alt="awall" width="32" height="32" />
          <span class="brand-text">管理系统</span>
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
      <nav class="area-c" aria-label="侧边菜单">
        <div v-for="group in visibleMenu" :key="group.id" class="c-group">
          <button
            type="button"
            class="c-item"
            :class="{ active: activeGroup?.id === group.id }"
            @click="onPrimary(group)"
          >
            <el-icon :size="18"><component :is="iconMap[group.icon]" /></el-icon>
            <span>{{ group.label }}</span>
          </button>
          <div
            v-if="activeGroup?.id === group.id && group.children.length > 1"
            class="c-children"
          >
            <RouterLink
              v-for="child in group.children"
              :key="child.id"
              :to="child.path"
              class="c-child"
              :class="{ active: activeChildPath === child.path }"
            >
              {{ child.label }}
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="area-d">
        <aside class="area-e" aria-hidden="true" />
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
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

@keyframes admin-bg-start-fade {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}

@keyframes brand-text-flow {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

.area-a {
  height: var(--admin-a-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 0;
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 20;
  background: linear-gradient(to right, #eee9fa, #ffffff);
  background-attachment: fixed;
  border-bottom: 1px solid #fff;

  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(to right, #e9ebfa, #ffffff);
    animation: admin-bg-start-fade 16s ease-in-out infinite;
  }

  > * {
    position: relative;
    z-index: 1;
  }
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
  gap: 5px;
  padding: 0 0 0 10px;
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
  color: transparent;
  background-image: linear-gradient(
    90deg,
    #3191f1,
    #f8a336,
    #f84c6b,
    #f8a336,
    #3191f1
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: brand-text-flow 8s linear infinite;
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
  align-items: flex-start;
  
  background: linear-gradient(to bottom, #eee9fa, #ffffff);
  background-attachment: fixed;

  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(to bottom, #e9ebfa, #ffffff);
    animation: admin-bg-start-fade 16s ease-in-out infinite;
  }

  > * {
    position: relative;
    z-index: 1;
  }
}

.area-c {
  width: var(--admin-c-width);
  flex-shrink: 0;
  padding: 8px 6px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: transparent;
  position: sticky;
  top: var(--admin-a-height);
  max-height: calc(100vh - var(--admin-a-height));
  overflow-y: auto;
  align-self: flex-start;
}

.c-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--admin-muted);
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: var(--admin-text);
    background: rgba(255, 255, 255, 0.55);
  }

  &.active {
    color: var(--admin-accent);
    font-weight: 600;
  }
}

.c-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 0 4px 8px;
}

.c-child {
  display: block;
  padding: 6px 10px 6px 28px;
  border-radius: 6px;
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;

  &:hover {
    color: var(--admin-text);
  }

  &.active {
    color: var(--admin-accent);
    font-weight: 600;
  }
}

.area-d {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: var(--admin-f-height);
  background: #ffffff;
}

.area-e {
  width: 0;
  min-width: 0;
  padding: 0;
  margin: 0;
  overflow: hidden;
  border: none;
  flex-shrink: 0;
}

.area-f {
  flex: 1;
  min-width: 0;
  padding: 18px 20px 28px;
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
