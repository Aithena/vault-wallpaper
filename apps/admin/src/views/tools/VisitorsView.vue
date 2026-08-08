<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>访客统计</h1>
          <p class="sub">
            含未注册访客：IP、地区、设备、路径。今日 UV/PV 与近 14 天趋势；明细可筛选。
          </p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-row :gutter="16" style="margin-bottom: 16px">
        <el-col :xs="12" :sm="6">
          <div class="stat">
            <div class="stat-label">今日 UV</div>
            <div class="stat-value">{{ today.uv }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat">
            <div class="stat-label">今日 PV</div>
            <div class="stat-value">{{ today.pv }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat">
            <div class="stat-label">区间 UV（按日合计）</div>
            <div class="stat-value">{{ recent.uv }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="stat">
            <div class="stat-label">区间 PV</div>
            <div class="stat-value">{{ recent.pv }}</div>
          </div>
        </el-col>
      </el-row>

      <div class="charts">
        <section class="chart-section">
          <h3 class="section-title">区间 UV / PV 趋势</h3>
          <VChart class="chart" :option="trendOption" autoresize />
        </section>
        <section class="chart-section">
          <h3 class="section-title">设备占比（明细）</h3>
          <VChart class="chart" :option="devicePieOption" autoresize />
        </section>
      </div>

      <el-row :gutter="16" style="margin: 16px 0">
        <el-col :md="12" :xs="24">
          <h3 class="section-title">Top 地区</h3>
          <el-table :data="recent.byCountry" size="small" stripe border max-height="240">
            <el-table-column prop="name" label="地区/国家" />
            <el-table-column prop="count" label="PV" width="80" />
          </el-table>
        </el-col>
        <el-col :md="12" :xs="24">
          <h3 class="section-title">Top 路径</h3>
          <el-table :data="recent.byPath" size="small" stripe border max-height="240">
            <el-table-column prop="name" label="路径" min-width="160" />
            <el-table-column prop="count" label="PV" width="80" />
          </el-table>
        </el-col>
      </el-row>

      <div class="filter-row" style="margin: 16px 0 14px">
        <el-select v-model="filters.device" style="width: 120px" @change="onFilterChange">
          <el-option label="全部设备" value="all" />
          <el-option label="desktop" value="desktop" />
          <el-option label="mobile" value="mobile" />
          <el-option label="tablet" value="tablet" />
          <el-option label="bot" value="bot" />
        </el-select>
        <el-select v-model="filters.loggedIn" style="width: 130px" @change="onFilterChange">
          <el-option label="全部访客" value="all" />
          <el-option label="已登录" value="yes" />
          <el-option label="未登录" value="no" />
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
          placeholder="IP / 访客 / 邮箱 / 地区 / 路径"
          style="width: 260px"
          @change="onFilterChange"
          @clear="onFilterChange"
        />
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="140" />
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column label="地区" min-width="140">
          <template #default="{ row }">{{ geoLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="设备" min-width="140">
          <template #default="{ row }">
            {{ row.device }}{{ row.os ? ` · ${row.os}` : ''
            }}{{ row.browser ? ` · ${row.browser}` : '' }}
          </template>
        </el-table-column>
        <el-table-column label="登录" width="140">
          <template #default="{ row }">
            <el-button
              v-if="row.email"
              link
              type="primary"
              @click="$router.push(`/users?q=${encodeURIComponent(row.email)}`)"
            >
              {{ row.email }}
            </el-button>
            <span v-else class="muted">未登录</span>
          </template>
        </el-table-column>
        <el-table-column prop="visitorId" label="访客 ID" min-width="120" show-overflow-tooltip />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
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

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
])

type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>

type NameCount = { name: string; count: number }

type PvRow = {
  id: string
  at: string
  visitorId: string
  path: string
  ip: string
  country?: string
  city?: string
  region?: string
  device: string
  os?: string
  browser?: string
  email?: string | null
}

const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref<PvRow[]>([])
const dateRange = ref<[string, string] | null>(defaultDateRange())
const rangePickAnchor = ref<Date | null>(null)
const disabledDate = makeRangeDisabledDate(() => rangePickAnchor.value)
const filters = reactive({ device: 'all', loggedIn: 'all', q: '' })
const today = ref({ uv: 0, pv: 0 })
const recent = ref({
  uv: 0,
  pv: 0,
  byCountry: [] as NameCount[],
  byDevice: [] as NameCount[],
  byPath: [] as NameCount[],
})
const trend = ref<{ date: string; pv: number; uv: number }[]>([])

const trendOption = computed<ECOption>(() => ({
  color: ['#409eff', '#67c23a'],
  tooltip: { trigger: 'axis' },
  legend: { data: ['PV', 'UV'], bottom: 0 },
  grid: { left: 40, right: 24, top: 24, bottom: 48 },
  xAxis: {
    type: 'category',
    data: trend.value.map((t) => t.date.slice(5)),
    axisLabel: { rotate: 40, fontSize: 11 },
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    { name: 'PV', type: 'bar', data: trend.value.map((t) => t.pv), barMaxWidth: 14 },
    { name: 'UV', type: 'line', smooth: true, data: trend.value.map((t) => t.uv) },
  ],
}))

const devicePieOption = computed<ECOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { orient: 'vertical', right: 8, top: 'middle' },
  series: [
    {
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['40%', '50%'],
      data: recent.value.byDevice.map((d) => ({ name: d.name, value: d.count })),
    },
  ],
}))

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function geoLabel(row: { country?: string; region?: string; city?: string }) {
  return [row.country, row.region, row.city].filter(Boolean).join(' · ') || '—'
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
      device: filters.device,
      loggedIn: filters.loggedIn,
      q: filters.q.trim(),
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    const data = await adminApi<{
      today: { uv: number; pv: number }
      recent: {
        uv: number
        pv: number
        byCountry: NameCount[]
        byDevice: NameCount[]
        byPath: NameCount[]
      }
      trend: { date: string; pv: number; uv: number }[]
      records: PvRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/visitors/stats${qs}`)
    today.value = data.today
    recent.value = data.recent
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
.charts {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
}
@media (max-width: 960px) {
  .charts {
    grid-template-columns: 1fr;
  }
}
.chart-section {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.section-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.chart {
  width: 100%;
  height: 300px;
}
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
