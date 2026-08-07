<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>全部订单</h1>
          <p class="sub">含正式付费、0 元免费开通、后台手工开通；P0 以只读为主。</p>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select v-model="filters.status" style="width: 130px">
          <el-option label="全部状态" value="all" />
          <el-option label="pending" value="pending" />
          <el-option label="paid" value="paid" />
          <el-option label="refunded" value="refunded" />
        </el-select>
        <el-select v-model="filters.type" style="width: 150px">
          <el-option label="全部类型" value="all" />
          <el-option label="paid" value="paid" />
          <el-option label="free" value="free" />
          <el-option label="admin_grant" value="admin_grant" />
          <el-option label="mock" value="mock" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="创建起"
          end-placeholder="创建止"
          value-format="YYYY-MM-DD"
        />
        <el-input v-model="filters.q" clearable placeholder="邮箱 / 订单号" style="width: 220px" />
      </div>

      <el-table :data="filtered" stripe border>
        <el-table-column prop="id" label="订单号" min-width="140" />
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">{{ row.userEmail || row.userId }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="tier" label="档位" width="80" />
        <el-table-column label="金额" width="90">
          <template #default="{ row }">¥{{ row.totalFee }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="支付时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as OrderRow)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="detailVisible"
      :title="detailOrder ? `订单详情 · ${detailOrder.id}` : '订单详情'"
      width="720px"
      destroy-on-close
    >
      <div v-loading="detailLoading">
        <el-descriptions v-if="detailOrder" :column="2" border>
          <el-descriptions-item label="订单号">{{ detailOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detailOrder.status)" size="small">{{ detailOrder.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ detailOrder.type }}</el-descriptions-item>
          <el-descriptions-item label="档位">{{ detailOrder.tier }}</el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ detailOrder.totalFee }}</el-descriptions-item>
          <el-descriptions-item label="用户邮箱">
            {{ detailOrder.userEmail || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="用户 ID">{{ detailOrder.userId }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detailOrder.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatTime(detailOrder.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="回调时间">{{ formatTime(detailOrder.callbackAt) }}</el-descriptions-item>
        </el-descriptions>

        <template v-if="detailUser">
          <h3 class="section-title">关联用户</h3>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="邮箱">{{ detailUser.email }}</el-descriptions-item>
            <el-descriptions-item label="账号">
              {{ detailUser.accountStatus === 'active' ? '正常' : '已禁用' }}
            </el-descriptions-item>
            <el-descriptions-item label="会员档位">{{ detailUser.memberTier ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="到期">{{ formatTime(detailUser.memberExpiresAt) }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <h3 class="section-title">支付回调原文（只读）</h3>
        <el-input
          v-if="detailOrder?.callbackPayload"
          type="textarea"
          :rows="8"
          readonly
          :model-value="JSON.stringify(detailOrder.callbackPayload, null, 2)"
        />
        <p v-else class="empty-hint">暂无回调记录（免费开通 / mock / 后台开通通常无回调）</p>
      </div>
      <template #footer>
        <el-button
          v-if="detailOrder?.userId"
          @click="$router.push({ path: '/users', query: { q: detailOrder.userEmail || '' } })"
        >
          去用户列表
        </el-button>
        <el-button type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'

type OrderRow = {
  id: string
  userId: string
  userEmail: string | null
  tier: string
  totalFee: string
  status: string
  type: string
  createdAt: string
  paidAt?: string | null
  hasCallback?: boolean
}

type OrderDetail = OrderRow & {
  callbackAt?: string | null
  callbackPayload?: Record<string, string> | null
}

type UserBrief = {
  id: string
  email: string
  memberTier: string | null
  memberExpiresAt: string | null
  accountStatus: string
  membershipActive?: boolean
}

const route = useRoute()
const loading = ref(false)
const rows = ref<OrderRow[]>([])
const dateRange = ref<[string, string] | null>(null)
const filters = reactive({ status: 'all', type: 'all', q: '' })

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailOrder = ref<OrderDetail | null>(null)
const detailUser = ref<UserBrief | null>(null)

const filtered = computed(() =>
  rows.value.filter((r) => {
    if (filters.status !== 'all' && r.status !== filters.status) return false
    if (filters.type !== 'all' && r.type !== filters.type) return false
    const q = filters.q.trim().toLowerCase()
    if (
      q &&
      !(r.userEmail || '').toLowerCase().includes(q) &&
      !r.id.toLowerCase().includes(q)
    ) {
      return false
    }
    if (dateRange.value) {
      const [from, to] = dateRange.value
      const day = r.createdAt.slice(0, 10)
      if (day < from || day > to) return false
    }
    return true
  }),
)

function formatTime(v: string | null | undefined) {
  if (!v) return '—'
  return v.replace('T', ' ').slice(0, 19)
}

function statusType(s: string) {
  if (s === 'pending') return 'warning'
  if (s === 'paid') return 'success'
  if (s === 'refunded') return 'info'
  return 'info'
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ orders: OrderRow[] }>('/api/admin/orders')
    rows.value = data.orders
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row: OrderRow) {
  detailVisible.value = true
  detailLoading.value = true
  detailOrder.value = { ...row }
  detailUser.value = null
  try {
    const data = await adminApi<{ order: OrderDetail; user: UserBrief | null }>(
      `/api/admin/orders/${row.id}`,
    )
    detailOrder.value = data.order
    detailUser.value = data.user
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

onMounted(async () => {
  await load()
  const openId = typeof route.query.id === 'string' ? route.query.id : ''
  if (openId) {
    const hit = rows.value.find((r) => r.id === openId)
    if (hit) await openDetail(hit)
    else {
      try {
        await openDetail({
          id: openId,
          userId: '',
          userEmail: null,
          tier: '',
          totalFee: '',
          status: '',
          type: '',
          createdAt: '',
        })
      } catch {
        /* openDetail already toasts */
      }
    }
  }
})

watch(
  () => route.query.id,
  async (id) => {
    if (typeof id === 'string' && id && detailOrder.value?.id !== id) {
      const hit = rows.value.find((r) => r.id === id)
      if (hit) await openDetail(hit)
    }
  },
)
</script>

<style scoped>
.section-title {
  margin: 18px 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.empty-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
