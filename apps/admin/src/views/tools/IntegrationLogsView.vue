<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>第三方接口日志</h1>
          <p class="sub">
            存档 Workers AI、Resend、虎皮椒等入参与返回（密钥与图片 base64 已脱敏），便于排查对接问题。
          </p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select v-model="filters.provider" style="width: 140px" @change="onFilterChange">
          <el-option label="全部渠道" value="all" />
          <el-option label="Workers AI" value="workers_ai" />
          <el-option label="Resend" value="resend" />
          <el-option label="虎皮椒" value="xunhupay" />
        </el-select>
        <el-select v-model="filters.ok" style="width: 120px" @change="onFilterChange">
          <el-option label="全部结果" value="all" />
          <el-option label="成功" value="1" />
          <el-option label="失败" value="0" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 248px"
          :disabled-date="disabledDate"
          @calendar-change="onCalendarChange"
          @change="onDateRangeChange"
        />
        <el-input
          v-model="filters.q"
          clearable
          placeholder="搜索 action / refId / 错误"
          style="width: 240px"
          @keyup.enter="onFilterChange"
          @clear="onFilterChange"
        />
        <el-button type="primary" @click="onFilterChange">查询</el-button>
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="渠道" width="120">
          <template #default="{ row }">{{ providerLabel(row.provider) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="动作" min-width="140" />
        <el-table-column label="方向" width="90">
          <template #default="{ row }">
            {{ row.direction === 'inbound' ? '入站' : '出站' }}
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'danger'" size="small">
              {{ row.ok ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联" min-width="160">
          <template #default="{ row }">
            <span v-if="row.refType || row.refId">
              {{ row.refType || '—' }} · {{ row.refId || '—' }}
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="90">
          <template #default="{ row }">{{ formatMs(row.durationMs) }}</template>
        </el-table-column>
        <el-table-column label="错误" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.error || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="table-pagination"
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        @current-change="load"
        @size-change="onSizeChange"
      />
    </div>

    <el-drawer v-model="detailOpen" title="接口日志详情" size="560px" destroy-on-close>
      <div v-loading="detailLoading" class="detail">
        <template v-if="detail">
          <div class="kv"><span>ID</span><code>{{ detail.id }}</code></div>
          <div class="kv"><span>时间</span>{{ formatTime(detail.createdAt) }}</div>
          <div class="kv"><span>渠道</span>{{ providerLabel(detail.provider) }}</div>
          <div class="kv"><span>动作</span>{{ detail.action }}</div>
          <div class="kv">
            <span>结果</span>
            <el-tag :type="detail.ok ? 'success' : 'danger'" size="small">
              {{ detail.ok ? '成功' : '失败' }}
            </el-tag>
          </div>
          <div v-if="detail.error" class="kv"><span>错误</span>{{ detail.error }}</div>

          <h4>入参 request</h4>
          <pre class="json">{{ pretty(detail.request) }}</pre>
          <h4>返回 response</h4>
          <pre class="json">{{ pretty(detail.response) }}</pre>
          <h4 v-if="detail.meta">附加 meta</h4>
          <pre v-if="detail.meta" class="json">{{ pretty(detail.meta) }}</pre>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import {
  defaultDateRange,
  isDateRangeTooLong,
  makeRangeDisabledDate,
} from '../../lib/date-range'

type LogRow = {
  id: string
  createdAt: string
  provider: string
  action: string
  direction: string
  ok: boolean
  durationMs: number
  refType?: string
  refId?: string
  error?: string
  request?: unknown
  response?: unknown
  meta?: Record<string, unknown>
}

const loading = ref(false)
const rows = ref<LogRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const dateRange = ref<[string, string] | null>(defaultDateRange())
const rangePickAnchor = ref<Date | null>(null)
const disabledDate = makeRangeDisabledDate(() => rangePickAnchor.value)
const filters = reactive({
  provider: 'all',
  ok: 'all',
  q: '',
})

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<LogRow | null>(null)

function providerLabel(p: string) {
  return (
    (
      {
        workers_ai: 'Workers AI',
        resend: 'Resend',
        xunhupay: '虎皮椒',
      } as Record<string, string>
    )[p] || p
  )
}

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function formatMs(ms: number) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function pretty(v: unknown) {
  if (v === undefined) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
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
  void load()
}

function onSizeChange() {
  page.value = 1
  void load()
}

async function load() {
  loading.value = true
  try {
    const qs = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      provider: filters.provider,
      ok: filters.ok,
    })
    if (filters.q.trim()) qs.set('q', filters.q.trim())
    if (dateRange.value?.[0]) qs.set('dateFrom', dateRange.value[0])
    if (dateRange.value?.[1]) qs.set('dateTo', dateRange.value[1])
    const data = await adminApi<{
      records: LogRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/integration-logs?${qs}`)
    rows.value = data.records
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(id: string) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const data = await adminApi<{ record: LogRow }>(
      `/api/admin/integration-logs/${id}`,
    )
    detail.value = data.record
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载详情失败')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.detail .kv {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.detail .kv span {
  width: 56px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.detail h4 {
  margin: 18px 0 8px;
  font-size: 13px;
}
.json {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.45;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
