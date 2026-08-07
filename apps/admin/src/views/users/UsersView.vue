<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>用户列表</h1>
          <p class="sub">基础信息、禁用/解封、手动续费；可查看详情与用户操作日志。</p>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select v-model="filters.memberType" placeholder="会员类型" style="width: 140px">
          <el-option label="全部" value="all" />
          <el-option label="付费会员" value="paid" />
          <el-option label="免费用户" value="free" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="注册起"
          end-placeholder="注册止"
          value-format="YYYY-MM-DD"
        />
        <el-select v-model="filters.blacklisted" placeholder="是否拉黑" style="width: 120px">
          <el-option label="全部" value="all" />
          <el-option label="已拉黑" value="yes" />
          <el-option label="未拉黑" value="no" />
        </el-select>
        <el-input v-model="filters.q" clearable placeholder="搜索邮箱" style="width: 220px" />
      </div>

      <el-table :data="filtered" stripe border>
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column label="会员档位" width="100">
          <template #default="{ row }">{{ row.memberTier ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="会员状态" width="110">
          <template #default="{ row }">
            <el-tag :type="memberTag(row as UserRow)" size="small">{{ memberLabel(row as UserRow) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到期时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.memberExpiresAt) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="账号状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.accountStatus === 'active' ? 'success' : 'danger'" size="small">
              {{ row.accountStatus === 'active' ? '正常' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="拉黑" width="80">
          <template #default="{ row }">{{ row.blacklisted ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="340">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as UserRow)">详情</el-button>
            <el-button
              v-if="hasButton('users.list.logs')"
              link
              type="primary"
              @click="openLogs(row as UserRow)"
            >
              日志
            </el-button>
            <el-button
              v-if="hasButton('users.list.renew')"
              link
              type="primary"
              @click="renew(row as UserRow)"
            >
              续费
            </el-button>
            <el-button
              v-if="
                row.blacklisted
                  ? hasButton('users.blacklist.remove')
                  : hasButton('users.blacklist.create')
              "
              link
              type="warning"
              @click="toggleBlacklist(row as UserRow)"
            >
              {{ row.blacklisted ? '解除拉黑' : '拉黑' }}
            </el-button>
            <el-button
              v-if="hasButton('users.list.disable')"
              link
              :type="row.accountStatus === 'active' ? 'danger' : 'success'"
              @click="toggleDisable(row as UserRow)"
            >
              {{ row.accountStatus === 'active' ? '禁用' : '解封' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="detailVisible"
      :title="detailUser ? `用户详情 · ${detailUser.email}` : '用户详情'"
      width="720px"
      destroy-on-close
    >
      <div v-loading="detailLoading">
        <el-descriptions v-if="detailUser" :column="2" border>
          <el-descriptions-item label="用户 ID">{{ detailUser.id }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ detailUser.email }}</el-descriptions-item>
          <el-descriptions-item label="会员档位">{{ detailUser.memberTier ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="会员状态">
            {{ memberLabel(detailUser) }}
          </el-descriptions-item>
          <el-descriptions-item label="开通时间">{{ formatTime(detailUser.memberSince) }}</el-descriptions-item>
          <el-descriptions-item label="到期时间">{{ formatTime(detailUser.memberExpiresAt) }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatTime(detailUser.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">
            {{ detailUser.accountStatus === 'active' ? '正常' : '已禁用' }}
          </el-descriptions-item>
          <el-descriptions-item label="拉黑">{{ detailUser.blacklisted ? '是' : '否' }}</el-descriptions-item>
        </el-descriptions>

        <h3 class="section-title">近期订单</h3>
        <el-table :data="detailOrders" stripe border size="small" max-height="260">
          <el-table-column prop="id" label="订单号" min-width="120" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="tier" label="档位" width="80" />
          <el-table-column label="金额" width="90">
            <template #default="{ row }">¥{{ row.totalFee }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column label="创建时间" min-width="150">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <p v-if="!detailOrders.length" class="empty-hint">暂无订单</p>
      </div>
      <template #footer>
        <el-button
          v-if="detailUser && hasButton('users.list.logs')"
          @click="openLogs(detailUser)"
        >
          查看日志
        </el-button>
        <el-button type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="logsVisible"
      :title="logsUser ? `用户操作日志 · ${logsUser.email}` : '用户操作日志'"
      width="800px"
      destroy-on-close
    >
      <el-table v-loading="logsLoading" :data="logs" stripe border max-height="420">
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="动作" min-width="120" />
        <el-table-column label="操作者" width="140">
          <template #default="{ row }">
            {{ actorLabel(row as UserLogRow) }}
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="200">
          <template #default="{ row }">{{ row.detail || '—' }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!logsLoading && !logs.length" class="empty-hint">暂无日志</p>
      <template #footer>
        <el-button type="primary" @click="logsVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type UserRow = {
  id: string
  email: string
  memberTier: string | null
  memberStatus: string | null
  memberExpiresAt: string | null
  memberSince?: string | null
  createdAt: string
  accountStatus: 'active' | 'disabled'
  blacklisted: boolean
  membershipActive?: boolean
}

type OrderRow = {
  id: string
  type?: string
  tier: string
  totalFee: string
  status: string
  createdAt: string
}

type UserLogRow = {
  id: string
  at: string
  action: string
  detail?: string
  actorType: 'admin' | 'system' | 'user'
  actorId?: string
  actorName?: string
}

const { hasButton } = usePermission()
const route = useRoute()
const loading = ref(false)
const users = ref<UserRow[]>([])
const dateRange = ref<[string, string] | null>(null)
const filters = reactive({
  memberType: 'all',
  blacklisted: 'all',
  q: typeof route.query.q === 'string' ? route.query.q : '',
})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailUser = ref<UserRow | null>(null)
const detailOrders = ref<OrderRow[]>([])

const logsVisible = ref(false)
const logsLoading = ref(false)
const logsUser = ref<UserRow | null>(null)
const logs = ref<UserLogRow[]>([])

const filtered = computed(() =>
  users.value.filter((u) => {
    if (filters.q && !u.email.includes(filters.q.trim().toLowerCase())) return false
    if (filters.blacklisted === 'yes' && !u.blacklisted) return false
    if (filters.blacklisted === 'no' && u.blacklisted) return false
    const paid = u.membershipActive && u.memberTier && u.memberTier !== 'free'
    if (filters.memberType === 'paid' && !paid) return false
    if (filters.memberType === 'free' && paid) return false
    if (dateRange.value) {
      const [from, to] = dateRange.value
      const day = u.createdAt.slice(0, 10)
      if (day < from || day > to) return false
    }
    return true
  }),
)

function formatTime(v: string | null | undefined) {
  if (!v) return '—'
  return v.replace('T', ' ').slice(0, 19)
}

function memberLabel(row: UserRow) {
  if (row.membershipActive) return '有效'
  if (!row.memberTier) return '未开通'
  return '已过期/无效'
}

function memberTag(row: UserRow) {
  if (row.membershipActive) return 'success' as const
  if (!row.memberTier) return 'info' as const
  return 'warning' as const
}

function actorLabel(row: UserLogRow) {
  if (row.actorType === 'admin') return row.actorName || '管理员'
  if (row.actorType === 'user') return row.actorName || '用户本人'
  return '系统'
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ users: UserRow[] }>('/api/admin/users')
    users.value = data.users
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row: UserRow) {
  detailVisible.value = true
  detailLoading.value = true
  detailUser.value = row
  detailOrders.value = []
  try {
    const data = await adminApi<{ user: UserRow; orders: OrderRow[] }>(
      `/api/admin/users/${row.id}`,
    )
    detailUser.value = data.user
    detailOrders.value = data.orders
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function openLogs(row: UserRow) {
  logsVisible.value = true
  logsLoading.value = true
  logsUser.value = row
  logs.value = []
  try {
    const data = await adminApi<{ user: UserRow; logs: UserLogRow[] }>(
      `/api/admin/users/${row.id}/logs?limit=100`,
    )
    logsUser.value = data.user
    logs.value = data.logs
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载日志失败')
  } finally {
    logsLoading.value = false
  }
}

async function toggleDisable(row: UserRow) {
  const next = row.accountStatus === 'active' ? 'disabled' : 'active'
  try {
    await ElMessageBox.confirm(
      `确定将 ${row.email} ${next === 'disabled' ? '禁用' : '解封'}？`,
      '账号状态',
    )
    await adminApi(`/api/admin/users/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus: next }),
    })
    ElMessage.success('已更新')
    await load()
    if (detailVisible.value && detailUser.value?.id === row.id) {
      await openDetail(row)
    }
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '操作失败')
  }
}

async function toggleBlacklist(row: UserRow) {
  try {
    if (row.blacklisted) {
      await ElMessageBox.confirm(`解除拉黑 ${row.email}？`, '解除拉黑')
      await adminApi(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ blacklisted: false }),
      })
      ElMessage.success('已解除拉黑')
    } else {
      const { value } = await ElMessageBox.prompt('请输入拉黑原因（可选）', '拉黑用户', {
        inputValue: '异常行为',
        inputPlaceholder: '原因',
      })
      await adminApi(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ blacklisted: true, blacklistReason: value }),
      })
      ElMessage.success('已拉黑')
    }
    await load()
    if (detailVisible.value && detailUser.value?.id === row.id) {
      await openDetail(row)
    }
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '操作失败')
  }
}

async function renew(row: UserRow) {
  try {
    const { value } = await ElMessageBox.prompt('输入档位：basic / pro / max', '手动续费', {
      inputValue: row.memberTier && row.memberTier !== 'free' ? row.memberTier : 'basic',
      inputPattern: /^(basic|pro|max)$/,
      inputErrorMessage: '仅支持 basic / pro / max',
    })
    await adminApi(`/api/admin/users/${row.id}/renew`, {
      method: 'POST',
      body: JSON.stringify({ tier: value }),
    })
    ElMessage.success('已续费')
    await load()
    if (detailVisible.value && detailUser.value?.id === row.id) {
      await openDetail(row)
    }
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '续费失败')
  }
}

onMounted(load)
</script>

<style scoped>
.section-title {
  margin: 18px 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.empty-hint {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
