<template>
  <div class="admin-layout">
    <header class="area-a">
      <div class="a-left">
        <div class="brand">
          <img class="brand-logo" src="/logo.svg" alt="awall" width="32" height="32" />
          <span class="brand-text">Awall 管理后台</span>
        </div>
        <el-input
          class="quick-search"
          placeholder="快捷入口（静态占位）"
          :prefix-icon="Search"
          clearable
        />
      </div>
      <div class="a-right">
        <el-popover
          placement="bottom-end"
          :width="360"
          trigger="click"
          @show="loadNotifications"
        >
          <template #reference>
            <el-badge :value="notifBadge" :hidden="!notifBadge" :max="99">
              <el-button :icon="Bell" circle title="消息" />
            </el-badge>
          </template>
          <div class="notif-panel">
            <div class="notif-head">待办提醒</div>
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
              <p v-if="!notifLoading && !notifItems.length" class="notif-empty">暂无待办</p>
            </div>
          </div>
        </el-popover>
        <el-dropdown trigger="click" @command="onCommand">
          <div class="admin-chip">
            <span class="admin-name">{{ profile?.name ?? '管理员' }}</span>
            <span class="admin-user">{{ profile?.username ?? '—' }}</span>
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
          <el-icon :size="20"><component :is="iconMap[group.icon]" /></el-icon>
          <span>{{ group.label }}</span>
        </button>
      </nav>

      <div class="area-d">
        <aside class="area-e" aria-label="二级菜单">
          <div class="e-title">{{ activeGroup?.label }}</div>
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
import { computed, onMounted, ref } from 'vue'
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
const notifItems = ref<NotifItem[]>([])
const notifLoading = ref(false)

async function loadNotifications() {
  notifLoading.value = true
  try {
    const data = await adminApi<{ badge: number; items: NotifItem[] }>(
      '/api/admin/dashboard/notifications',
    )
    notifBadge.value = data.badge
    notifItems.value = data.items
  } catch {
    notifBadge.value = 0
    notifItems.value = []
  } finally {
    notifLoading.value = false
  }
}

function openNotification(item: NotifItem) {
  void router.push(item.path)
}

onMounted(() => {
  void refreshAdminMe().then((admin) => {
    if (admin) profile.value = admin
  })
  void loadNotifications()
  window.setInterval(() => {
    void loadNotifications()
  }, 60_000)
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
  padding: 0 16px 0 12px;
  border-bottom: 1px solid var(--admin-line);
  background: rgba(255, 255, 255, 0.72);
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
  gap: 8px;
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

.admin-user {
  color: var(--admin-muted);
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
  border-right: 1px solid var(--admin-line);
  background: rgba(255, 255, 255, 0.45);
}

.c-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--admin-muted);
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.7);
    color: var(--admin-text);
  }

  &.active {
    background: #fff;
    color: var(--admin-accent);
    box-shadow: 0 1px 2px rgba(27, 36, 48, 0.04), 0 8px 24px rgba(27, 36, 48, 0.06);
  }
}

.area-d {
  flex: 1;
  display: flex;
  min-width: 0;
}

.area-e {
  width: var(--admin-e-width);
  padding: 12px 8px;
  border-right: 1px solid var(--admin-line);
  background: rgba(255, 255, 255, 0.66);

  :deep(.el-menu) {
    border-right: none;
    background: transparent;
  }
}

.e-title {
  font-size: 13px;
  font-weight: 650;
  margin: 4px 8px 10px;
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
  font-size: 13px;
  font-weight: 650;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--admin-line);
  margin-bottom: 6px;
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
