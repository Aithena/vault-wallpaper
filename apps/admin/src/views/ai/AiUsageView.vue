<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>AI 使用统计</h1>
          <p class="sub">
            Workers AI 壁纸识图调用记录：成功 / 失败 / 跳过、自动与手动触发、耗时与近 30 天趋势。
          </p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-row :gutter="16" style="margin-bottom: 20px">
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">累计调用</div>
            <div class="stat-value">{{ summary.total }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">成功</div>
            <div class="stat-value">{{ summary.success }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">失败</div>
            <div class="stat-value">{{ summary.failed }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">今日调用</div>
            <div class="stat-value">{{ summary.todayTotal }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">今日成功 / 失败</div>
            <div class="stat-value small">
              {{ summary.todaySuccess }} / {{ summary.todayFailed }}
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat">
            <div class="stat-label">平均耗时</div>
            <div class="stat-value small">{{ formatMs(summary.avgDurationMs) }}</div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-bottom: 8px">
        <el-col :span="24">
          <div class="chart-section">
            <h3 class="section-title">近 30 天调用趋势</h3>
            <VChart class="chart" :option="trendOption" autoresize />
          </div>
        </el-col>
      </el-row>

      <div class="filter-row" style="margin: 16px 0 14px">
        <el-select v-model="filters.status" style="width: 120px" @change="onFilterChange">
          <el-option label="全部结果" value="all" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="跳过" value="skipped" />
        </el-select>
        <el-select v-model="filters.trigger" style="width: 120px" @change="onFilterChange">
          <el-option label="全部触发" value="all" />
          <el-option label="自动" value="auto" />
          <el-option label="手动" value="manual" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="起"
          end-placeholder="止"
          value-format="YYYY-MM-DD"
          style="width: 248px"
          :disabled-date="disabledDate"
          @calendar-change="onCalendarChange"
          @change="onDateRangeChange"
        />
        <el-input
          v-model="filters.q"
          clearable
          placeholder="壁纸 ID / 标题 / 管理员 / 错误"
          style="width: 260px"
          @change="onFilterChange"
          @clear="onFilterChange"
        />
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="wallpaperTitle" label="壁纸" min-width="120" />
        <el-table-column prop="wallpaperId" label="壁纸 ID" min-width="120" />
        <el-table-column label="触发" width="80">
          <template #default="{ row }">{{ row.trigger === 'manual' ? '手动' : '自动' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="图源" width="90">
          <template #default="{ row }">{{ imageSourceLabel(row.imageSource) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="90">
          <template #default="{ row }">{{ formatMs(row.durationMs) }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="110">
          <template #default="{ row }">{{ row.adminUsername || '—' }}</template>
        </el-table-column>
        <el-table-column label="错误" min-width="140">
          <template #default="{ row }">{{ row.error || '—' }}</template>
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
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
} from 'echarts/components'
import { adminApi, ApiError } from '../../lib/api'
import {
  defaultDateRange,
  isDateRangeTooLong,
  makeRangeDisabledDate,
} from '../../lib/date-range'
import { buildQuery } from '../../lib/query'

use([CanvasRenderer, BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent])

type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>

type Summary = {
  total: number
  success: number
  failed: number
  skipped: number
  todayTotal: number
  todaySuccess: number
  todayFailed: number
  avgDurationMs: number
  autoCount: number
  manualCount: number
}

type TrendPoint = { date: string; total: number; success: number; failed: number }

type UsageRow = {
  id: string
  createdAt: string
  wallpaperId: string
  wallpaperTitle: string
  trigger: string
  status: string
  imageSource: string
  durationMs: number
  error?: string
  adminUsername?: string
}

const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<UsageRow[]>([])
const trend = ref<TrendPoint[]>([])
const dateRange = ref<[string, string] | null>(defaultDateRange())
const rangePickAnchor = ref<Date | null>(null)
const disabledDate = makeRangeDisabledDate(() => rangePickAnchor.value)
const filters = reactive({ status: 'all', trigger: 'all', q: '' })
const summary = ref<Summary>({
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  todayTotal: 0,
  todaySuccess: 0,
  todayFailed: 0,
  avgDurationMs: 0,
  autoCount: 0,
  manualCount: 0,
})

const trendOption = computed<ECOption>(() => ({
  color: ['#409eff', '#67c23a', '#f56c6c'],
  tooltip: { trigger: 'axis' },
  legend: { data: ['调用', '成功', '失败'], bottom: 0 },
  grid: { left: 40, right: 24, top: 24, bottom: 48 },
  xAxis: {
    type: 'category',
    data: trend.value.map((t) => t.date.slice(5)),
    axisLabel: { rotate: 40, fontSize: 11 },
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    {
      name: '调用',
      type: 'bar',
      data: trend.value.map((t) => t.total),
      barMaxWidth: 12,
    },
    {
      name: '成功',
      type: 'line',
      smooth: true,
      data: trend.value.map((t) => t.success),
    },
    {
      name: '失败',
      type: 'line',
      smooth: true,
      data: trend.value.map((t) => t.failed),
    },
  ],
}))

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function formatMs(ms: number) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function statusLabel(s: string) {
  return ({ success: '成功', failed: '失败', skipped: '跳过' } as const)[s as 'success'] || s
}

function statusType(s: string): 'success' | 'danger' | 'info' {
  if (s === 'success') return 'success'
  if (s === 'failed') return 'danger'
  return 'info'
}

function imageSourceLabel(s: string) {
  return ({ preview: '预览', original: '原图', none: '无' } as const)[s as 'preview'] || s
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
      status: filters.status,
      trigger: filters.trigger,
      q: filters.q.trim(),
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    const data = await adminApi<{
      summary: Summary
      trend: TrendPoint[]
      records: UsageRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/ai/usage${qs}`)
    summary.value = data.summary
    trend.value = data.trend
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

onMounted(load)
</script>

<style scoped>
.stat {
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  margin-bottom: 12px;
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.stat-value {
  font-size: 22px;
  font-weight: 600;
}
.stat-value.small {
  font-size: 18px;
}
.chart-section {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
.chart {
  width: 100%;
  height: 320px;
}
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
