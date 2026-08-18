<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>全部订单</h1>
          <p class="sub">
            含正式付费、0 元免费开通、后台手工开通；默认近 30 天，最长可选 365 天。
          </p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('orders.list.export')"
            :loading="exporting"
            @click="exportCsv"
          >
            导出 CSV
          </el-button>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select v-model="filters.status" style="width: 130px" @change="onFilterChange">
          <el-option label="全部状态" value="all" />
          <el-option label="待支付" value="pending" />
          <el-option label="已支付" value="paid" />
          <el-option label="已退款" value="refunded" />
        </el-select>
        <el-select v-model="filters.type" style="width: 150px" @change="onFilterChange">
          <el-option label="全部类型" value="all" />
          <el-option label="正式付费" value="paid" />
          <el-option label="免费开通" value="free" />
          <el-option label="后台开通" value="admin_grant" />
          <el-option label="模拟支付" value="mock" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="创建起"
          end-placeholder="创建止"
          value-format="YYYY-MM-DD"
          style="width: 248px"
          :disabled-date="disabledDate"
          @calendar-change="onCalendarChange"
          @change="onDateRangeChange"
        />
        <el-input
          v-model="filters.q"
          clearable
          placeholder="邮箱 / 订单号"
          style="width: 220px"
          @change="onFilterChange"
          @clear="onFilterChange"
        />
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column prop="id" label="订单号" min-width="140" />
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">{{ row.userEmail || row.userId }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="tier" label="档位" width="80" />
        <el-table-column label="金额" width="90">
          <template #default="{ row }">¥{{ row.totalFee }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="支付时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as OrderRow)">详情</el-button>
            <el-button
              v-if="hasButton('orders.list.regrant')"
              link
              type="primary"
              :disabled="row.status !== 'paid'"
              @click="regrant(row as OrderRow)"
            >
              补发
            </el-button>
            <el-button
              v-if="hasButton('orders.list.refund')"
              link
              type="warning"
              :disabled="row.status !== 'paid'"
              @click="refund(row as OrderRow)"
            >
              退款
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        class="table-pagination"
        @size-change="onPageSizeChange"
        @current-change="load"
      />
    </div>

    <el-dialog
      append-to="#awall-overlays"
      v-model="detailVisible"
      :title="detailOrder ? `订单详情 · ${detailOrder.id}` : '订单详情'"
      width="720px"
      destroy-on-close
    >
      <div v-loading="detailLoading">
        <el-descriptions v-if="detailOrder" :column="2" border>
          <el-descriptions-item label="订单号">{{ detailOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detailOrder.status)" size="small">
              {{ statusLabel(detailOrder.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(detailOrder.type) }}</el-descriptions-item>
          <el-descriptions-item label="档位">{{ detailOrder.tier }}</el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ detailOrder.totalFee }}</el-descriptions-item>
          <el-descriptions-item label="用户邮箱">
            {{ detailOrder.userEmail || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="用户 ID">{{ detailOrder.userId }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detailOrder.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatTime(detailOrder.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="补发时间">{{ formatTime(detailOrder.regrantedAt) }}</el-descriptions-item>
          <el-descriptions-item label="退款时间">{{ formatTime(detailOrder.refundedAt) }}</el-descriptions-item>
          <el-descriptions-item label="退款备注" :span="2">
            {{ detailOrder.refundNote || '—' }}
          </el-descriptions-item>
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
          v-if="detailOrder?.status === 'paid' && hasButton('orders.list.regrant')"
          @click="regrant(detailOrder)"
        >
          补发会员
        </el-button>
        <el-button
          v-if="detailOrder?.status === 'paid' && hasButton('orders.list.refund')"
          type="warning"
          @click="refund(detailOrder)"
        >
          标记退款
        </el-button>
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
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, adminDownload, ApiError } from '../../lib/api'
import {
  defaultDateRange,
  isDateRangeTooLong,
  makeRangeDisabledDate,
} from '../../lib/date-range'
import { buildQuery } from '../../lib/query'
import { usePermission } from '../../lib/permission'

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
  refundedAt?: string | null
  regrantedAt?: string | null
  refundNote?: string | null
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

const { hasButton } = usePermission()
const route = useRoute()
const loading = ref(false)
const exporting = ref(false)
const rows = ref<OrderRow[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dateRange = ref<[string, string] | null>(defaultDateRange())
const rangePickAnchor = ref<Date | null>(null)
const disabledDate = makeRangeDisabledDate(() => rangePickAnchor.value)
const filters = reactive({ status: 'all', type: 'all', q: '' })

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailOrder = ref<OrderDetail | null>(null)
const detailUser = ref<UserBrief | null>(null)

function formatTime(v: string | null | undefined) {
  if (!v) return '—'
  return v.replace('T', ' ').slice(0, 19)
}

function statusLabel(s: string) {
  return (
    ({ pending: '待支付', paid: '已支付', refunded: '已退款' } as Record<string, string>)[s] ?? s
  )
}

function typeLabel(s: string) {
  return (
    (
      {
        paid: '正式付费',
        free: '免费开通',
        admin_grant: '后台开通',
        mock: '模拟支付',
      } as Record<string, string>
    )[s] ?? s
  )
}

function statusType(s: string) {
  if (s === 'pending') return 'warning'
  if (s === 'paid') return 'success'
  if (s === 'refunded') return 'info'
  return 'info'
}

function onCalendarChange(val: [Date, Date | null] | null) {
  rangePickAnchor.value = val?.[0] ?? null
}

function onDateRangeChange() {
  rangePickAnchor.value = null
  if (!dateRange.value) {
    dateRange.value = defaultDateRange()
  } else if (isDateRangeTooLong(dateRange.value)) {
    ElMessage.warning('时间范围最长 365 天')
    dateRange.value = defaultDateRange()
  }
  onFilterChange()
}

function onFilterChange() {
  page.value = 1
  load()
}

function onPageSizeChange() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const qs = buildQuery({
      page: page.value,
      pageSize: pageSize.value,
      q: filters.q.trim(),
      status: filters.status,
      type: filters.type,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    const data = await adminApi<{
      orders: OrderRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/orders${qs}`)
    rows.value = data.orders
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
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

async function regrant(row: OrderRow) {
  try {
    await ElMessageBox.confirm(
      `为订单 ${row.id} 补发「${row.tier}」会员权益？将按续费规则延长有效期。`,
      '补发会员',
    )
    await adminApi(`/api/admin/orders/${row.id}/regrant`, { method: 'POST' })
    ElMessage.success('已补发')
    await load()
    if (detailVisible.value && detailOrder.value?.id === row.id) {
      await openDetail(row)
    }
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '补发失败')
  }
}

async function refund(row: OrderRow) {
  try {
    const { value: note } = await ElMessageBox.prompt('退款备注（可选）', '标记退款', {
      inputPlaceholder: '如：用户申请退款',
      distinguishCancelAndClose: true,
    })
    let revokeMembership = false
    try {
      await ElMessageBox.confirm('是否同时收回该用户的会员权益？', '收回会员', {
        confirmButtonText: '收回会员',
        cancelButtonText: '仅标记退款',
        distinguishCancelAndClose: true,
        type: 'warning',
      })
      revokeMembership = true
    } catch (inner) {
      if (inner === 'close') return
      revokeMembership = false
    }
    await adminApi(`/api/admin/orders/${row.id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ note, revokeMembership }),
    })
    ElMessage.success(revokeMembership ? '已退款并收回会员' : '已标记退款')
    await load()
    if (detailVisible.value && detailOrder.value?.id === row.id) {
      await openDetail(row)
    }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof ApiError ? e.code : '退款失败')
  }
}

async function exportCsv() {
  exporting.value = true
  try {
    const qs = buildQuery({
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    await adminDownload(
      `/api/admin/orders/export${qs}`,
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    ElMessage.success('已开始下载')
  } catch (e) {
    const code = e instanceof ApiError ? e.code : '导出失败'
    ElMessage.error(
      code === 'range_too_long' ? '导出跨度不能超过 365 天' : code,
    )
  } finally {
    exporting.value = false
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
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
