<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>在线会员</h1>
          <p class="sub">
            近似在线：最近 {{ windowMinutes }} 分钟内有心跳或浏览活动的账号（默认只看有效会员）。
          </p>
        </div>
        <div class="actions">
          <el-switch
            v-model="membersOnly"
            active-text="仅会员"
            inactive-text="全部登录用户"
            @change="load"
          />
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 14px"
        :title="`当前约 ${rows.length} 人在线`"
      />

      <el-table :data="rows" stripe border>
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column label="档位" width="100">
          <template #default="{ row }">{{ row.memberTier ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="会员有效" width="100">
          <template #default="{ row }">
            <el-tag :type="row.membershipActive ? 'success' : 'info'" size="small">
              {{ row.membershipActive ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近路径" min-width="160">
          <template #default="{ row }">{{ row.path || '—' }}</template>
        </el-table-column>
        <el-table-column label="最近活跃" min-width="160">
          <template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/users?q=${encodeURIComponent(row.email)}`)">
              用户
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="!loading && !rows.length" class="empty-hint">当前没有检测到在线用户</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { buildQuery } from '../../lib/query'

type OnlineRow = {
  userId: string
  email: string
  memberTier: string | null
  membershipActive: boolean
  path?: string
  lastSeenAt: string
}

const loading = ref(false)
const membersOnly = ref(true)
const rows = ref<OnlineRow[]>([])
const windowMs = ref(10 * 60 * 1000)
let timer: ReturnType<typeof setInterval> | null = null

const windowMinutes = computed(() => Math.round(windowMs.value / 60000))

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

async function load() {
  loading.value = true
  try {
    const qs = buildQuery({ membersOnly: membersOnly.value ? '1' : '0' })
    const data = await adminApi<{
      online: OnlineRow[]
      total: number
      windowMs: number
    }>(`/api/admin/users/online${qs}`)
    rows.value = data.online
    windowMs.value = data.windowMs
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 30_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.empty-hint {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
