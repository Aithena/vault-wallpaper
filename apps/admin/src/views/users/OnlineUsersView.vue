<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>在线用户</h1>
          <p class="sub">
            注册登录即为会员。近似在线：最近 {{ windowMinutes }} 分钟内有心跳或浏览活动。可按权益状态筛选。
          </p>
        </div>
        <div class="actions">
          <el-select v-model="benefit" style="width: 140px" @change="load">
            <el-option label="全部权益" value="all" />
            <el-option label="未购买" value="never_purchased" />
            <el-option label="权益有效" value="active" />
            <el-option label="权益已过期" value="expired" />
          </el-select>
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
        <el-table-column label="权益状态" width="120">
          <template #default="{ row }">
            <el-tag :type="benefitTagType(row.benefitStatus)" size="small">
              {{ benefitLabel(row.benefitStatus) }}
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
            <el-button
              link
              type="primary"
              @click="$router.push(`/users?q=${encodeURIComponent(row.email)}`)"
            >
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

type BenefitStatus = 'never_purchased' | 'active' | 'expired'

type OnlineRow = {
  userId: string
  email: string
  memberTier: string | null
  benefitStatus: BenefitStatus
  path?: string
  lastSeenAt: string
}

const loading = ref(false)
const benefit = ref<'all' | BenefitStatus>('all')
const rows = ref<OnlineRow[]>([])
const windowMs = ref(10 * 60 * 1000)
let timer: ReturnType<typeof setInterval> | null = null

const windowMinutes = computed(() => Math.round(windowMs.value / 60000))

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function benefitLabel(s?: BenefitStatus) {
  return (
    {
      never_purchased: '未购买',
      active: '权益有效',
      expired: '已过期',
    }[s || 'never_purchased'] ?? '未购买'
  )
}

function benefitTagType(s?: BenefitStatus): 'info' | 'success' | 'warning' {
  if (s === 'active') return 'success'
  if (s === 'expired') return 'warning'
  return 'info'
}

async function load() {
  loading.value = true
  try {
    const qs = buildQuery({ benefit: benefit.value })
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
