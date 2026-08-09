<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>Cloudflare</h1>
          <p class="sub">
            用量来自 Cloudflare GraphQL Analytics（与控制台 Metrics 同源），约保留近 31 天。
          </p>
        </div>
        <div class="actions">
          <el-radio-group v-model="days" size="small" @change="load">
            <el-radio-button :value="7">7 天</el-radio-button>
            <el-radio-button :value="14">14 天</el-radio-button>
            <el-radio-button :value="31">31 天</el-radio-button>
          </el-radio-group>
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-alert
        v-if="configHint"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        :title="configHint"
      />

      <template v-else>
        <el-tabs v-model="tab" @tab-change="onTabChange">
          <el-tab-pane label="KV" name="kv" />
          <el-tab-pane label="Workers" name="workers" />
          <el-tab-pane label="R2" name="r2" />
          <el-tab-pane label="Workers AI" name="ai" />
        </el-tabs>

        <!-- KV -->
        <template v-if="tab === 'kv'">
          <el-row :gutter="16" style="margin-bottom: 16px">
            <el-col v-for="s in kvStats" :key="s.label" :xs="12" :sm="6">
              <div class="stat">
                <div class="stat-label">{{ s.label }}</div>
                <div class="stat-value">{{ formatNum(s.value) }}</div>
                <el-progress
                  :percentage="pct(s.value, s.cap)"
                  :status="s.warn ? 'warning' : undefined"
                  :stroke-width="8"
                  :show-text="false"
                  style="margin-top: 8px"
                />
                <div class="cap">免费上限 {{ formatNum(s.cap) }}/日</div>
              </div>
            </el-col>
          </el-row>
          <section class="chart-section">
            <h3 class="section-title">每日操作量</h3>
            <VChart class="chart" :option="kvChart" autoresize />
          </section>
          <el-table :data="kvDays" stripe border size="small" style="margin-top: 16px">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column label="Read" min-width="100">
              <template #default="{ row }">{{ formatNum(row.read) }}</template>
            </el-table-column>
            <el-table-column label="Write" min-width="100">
              <template #default="{ row }">{{ formatNum(row.write) }}</template>
            </el-table-column>
            <el-table-column label="List" min-width="90">
              <template #default="{ row }">{{ formatNum(row.list) }}</template>
            </el-table-column>
            <el-table-column label="Delete" min-width="90">
              <template #default="{ row }">{{ formatNum(row.delete) }}</template>
            </el-table-column>
          </el-table>
          <p v-if="meta.kvNs" class="muted ns">Namespace · {{ meta.kvNs }}</p>
        </template>

        <!-- Workers -->
        <template v-else-if="tab === 'workers'">
          <el-row :gutter="16" style="margin-bottom: 16px">
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日请求</div>
                <div class="stat-value">{{ formatNum(workersToday.requests) }}</div>
                <el-progress
                  :percentage="pct(workersToday.requests, workersCap)"
                  :stroke-width="8"
                  :show-text="false"
                  style="margin-top: 8px"
                />
                <div class="cap">免费上限约 {{ formatNum(workersCap) }}/日</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日错误</div>
                <div class="stat-value">{{ formatNum(workersToday.errors) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日子请求</div>
                <div class="stat-value">{{ formatNum(workersToday.subrequests) }}</div>
              </div>
            </el-col>
          </el-row>
          <section class="chart-section">
            <h3 class="section-title">每日请求 / 错误</h3>
            <VChart class="chart" :option="workersChart" autoresize />
          </section>
          <el-table :data="workersDays" stripe border size="small" style="margin-top: 16px">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column label="请求" min-width="100">
              <template #default="{ row }">{{ formatNum(row.requests) }}</template>
            </el-table-column>
            <el-table-column label="错误" min-width="90">
              <template #default="{ row }">{{ formatNum(row.errors) }}</template>
            </el-table-column>
            <el-table-column label="子请求" min-width="100">
              <template #default="{ row }">{{ formatNum(row.subrequests) }}</template>
            </el-table-column>
          </el-table>
          <p v-if="meta.script" class="muted ns">Worker · {{ meta.script }}</p>
        </template>

        <!-- R2 -->
        <template v-else-if="tab === 'r2'">
          <el-row :gutter="16" style="margin-bottom: 16px">
            <el-col :xs="12" :sm="6">
              <div class="stat">
                <div class="stat-label">今日 Class A</div>
                <div class="stat-value">{{ formatNum(r2Today.classA) }}</div>
                <div class="cap">月免费约 {{ formatNum(r2Caps.classA) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="6">
              <div class="stat">
                <div class="stat-label">今日 Class B</div>
                <div class="stat-value">{{ formatNum(r2Today.classB) }}</div>
                <div class="cap">月免费约 {{ formatNum(r2Caps.classB) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="6">
              <div class="stat">
                <div class="stat-label">对象数</div>
                <div class="stat-value">{{ formatNum(r2Storage.objectCount) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="6">
              <div class="stat">
                <div class="stat-label">占用空间</div>
                <div class="stat-value">{{ formatBytes(r2Storage.payloadBytes) }}</div>
              </div>
            </el-col>
          </el-row>
          <section class="chart-section">
            <h3 class="section-title">每日操作量</h3>
            <VChart class="chart" :option="r2Chart" autoresize />
          </section>
          <el-table :data="r2Days" stripe border size="small" style="margin-top: 16px">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column label="Class A" min-width="100">
              <template #default="{ row }">{{ formatNum(row.classA) }}</template>
            </el-table-column>
            <el-table-column label="Class B" min-width="100">
              <template #default="{ row }">{{ formatNum(row.classB) }}</template>
            </el-table-column>
            <el-table-column label="其他" min-width="90">
              <template #default="{ row }">{{ formatNum(row.other) }}</template>
            </el-table-column>
          </el-table>
          <p v-if="meta.bucket" class="muted ns">Bucket · {{ meta.bucket }}</p>
        </template>

        <!-- AI -->
        <template v-else>
          <el-row :gutter="16" style="margin-bottom: 16px">
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日调用</div>
                <div class="stat-value">{{ formatNum(aiToday.requests) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日输入 Token</div>
                <div class="stat-value">{{ formatNum(aiToday.inputTokens) }}</div>
              </div>
            </el-col>
            <el-col :xs="12" :sm="8">
              <div class="stat">
                <div class="stat-label">今日输出 Token</div>
                <div class="stat-value">{{ formatNum(aiToday.outputTokens) }}</div>
              </div>
            </el-col>
          </el-row>
          <section class="chart-section">
            <h3 class="section-title">每日调用 / Token</h3>
            <VChart class="chart" :option="aiChart" autoresize />
          </section>
          <el-table :data="aiDays" stripe border size="small" style="margin-top: 16px">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column label="调用" min-width="90">
              <template #default="{ row }">{{ formatNum(row.requests) }}</template>
            </el-table-column>
            <el-table-column label="输入 Token" min-width="110">
              <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
            </el-table-column>
            <el-table-column label="输出 Token" min-width="110">
              <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
            </el-table-column>
          </el-table>
          <p class="muted ns">平台侧用量；业务明细仍见「AI 使用统计」。</p>
        </template>
      </template>
    </div>
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

use([CanvasRenderer, BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent])

type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>

type Tab = 'kv' | 'workers' | 'r2' | 'ai'

const loading = ref(false)
const days = ref(14)
const tab = ref<Tab>('kv')
const configHint = ref('')
const loaded = reactive<Record<Tab, boolean>>({
  kv: false,
  workers: false,
  r2: false,
  ai: false,
})

const meta = reactive({ kvNs: '', script: '', bucket: '' })

const kvToday = ref({ date: '', read: 0, write: 0, delete: 0, list: 0 })
const kvDays = ref<typeof kvToday.value[]>([])
const kvCaps = ref({ read: 100_000, write: 1_000, delete: 1_000, list: 1_000 })

const workersToday = ref({ date: '', requests: 0, errors: 0, subrequests: 0 })
const workersDays = ref<typeof workersToday.value[]>([])
const workersCap = ref(100_000)

const r2Today = ref({ date: '', classA: 0, classB: 0, other: 0 })
const r2Days = ref<typeof r2Today.value[]>([])
const r2Storage = ref({ objectCount: 0, uploadCount: 0, payloadBytes: 0, metadataBytes: 0 })
const r2Caps = ref({ classA: 1_000_000, classB: 10_000_000 })

const aiToday = ref({ date: '', requests: 0, inputTokens: 0, outputTokens: 0 })
const aiDays = ref<typeof aiToday.value[]>([])

const kvStats = computed(() => [
  { label: '今日 Read', value: kvToday.value.read, cap: kvCaps.value.read, warn: false },
  { label: '今日 Write', value: kvToday.value.write, cap: kvCaps.value.write, warn: true },
  { label: '今日 List', value: kvToday.value.list, cap: kvCaps.value.list, warn: false },
  { label: '今日 Delete', value: kvToday.value.delete, cap: kvCaps.value.delete, warn: false },
])

function baseChart(categories: string[]): Partial<ECOption> {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 24, bottom: 48 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 40, fontSize: 11 },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
  }
}

const kvChart = computed<ECOption>(() => ({
  ...baseChart(kvDays.value.map((t) => t.date.slice(5))),
  color: ['#409eff', '#e6a23c', '#67c23a', '#f56c6c'],
  legend: { data: ['Read', 'Write', 'List', 'Delete'], bottom: 0 },
  series: [
    { name: 'Read', type: 'bar', stack: 'ops', data: kvDays.value.map((t) => t.read), barMaxWidth: 18 },
    { name: 'Write', type: 'bar', stack: 'ops', data: kvDays.value.map((t) => t.write), barMaxWidth: 18 },
    { name: 'List', type: 'line', data: kvDays.value.map((t) => t.list), smooth: true },
    { name: 'Delete', type: 'line', data: kvDays.value.map((t) => t.delete), smooth: true },
  ],
}))

const workersChart = computed<ECOption>(() => ({
  ...baseChart(workersDays.value.map((t) => t.date.slice(5))),
  color: ['#409eff', '#f56c6c'],
  legend: { data: ['请求', '错误'], bottom: 0 },
  series: [
    {
      name: '请求',
      type: 'bar',
      data: workersDays.value.map((t) => t.requests),
      barMaxWidth: 18,
    },
    {
      name: '错误',
      type: 'line',
      data: workersDays.value.map((t) => t.errors),
      smooth: true,
    },
  ],
}))

const r2Chart = computed<ECOption>(() => ({
  ...baseChart(r2Days.value.map((t) => t.date.slice(5))),
  color: ['#e6a23c', '#409eff', '#909399'],
  legend: { data: ['Class A', 'Class B', '其他'], bottom: 0 },
  series: [
    { name: 'Class A', type: 'bar', stack: 'r2', data: r2Days.value.map((t) => t.classA), barMaxWidth: 18 },
    { name: 'Class B', type: 'bar', stack: 'r2', data: r2Days.value.map((t) => t.classB), barMaxWidth: 18 },
    { name: '其他', type: 'line', data: r2Days.value.map((t) => t.other), smooth: true },
  ],
}))

const aiChart = computed<ECOption>(() => ({
  ...baseChart(aiDays.value.map((t) => t.date.slice(5))),
  color: ['#409eff', '#67c23a', '#e6a23c'],
  legend: { data: ['调用', '输入 Token', '输出 Token'], bottom: 0 },
  yAxis: [
    { type: 'value', name: '调用', splitLine: { lineStyle: { type: 'dashed' } } },
    { type: 'value', name: 'Token', splitLine: { show: false } },
  ],
  series: [
    { name: '调用', type: 'bar', data: aiDays.value.map((t) => t.requests), barMaxWidth: 18 },
    {
      name: '输入 Token',
      type: 'line',
      yAxisIndex: 1,
      data: aiDays.value.map((t) => t.inputTokens),
      smooth: true,
    },
    {
      name: '输出 Token',
      type: 'line',
      yAxisIndex: 1,
      data: aiDays.value.map((t) => t.outputTokens),
      smooth: true,
    },
  ],
}))

function formatNum(n: number) {
  return new Intl.NumberFormat('zh-CN').format(n || 0)
}

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

function pct(n: number, cap: number) {
  if (!cap) return 0
  return Math.min(100, Math.round((n / cap) * 1000) / 10)
}

async function loadTab(kind: Tab, force = false) {
  if (loaded[kind] && !force) return
  loading.value = true
  configHint.value = ''
  try {
    if (kind === 'kv') {
      const data = await adminApi<{
        namespaceId?: string
        caps?: typeof kvCaps.value
        today?: typeof kvToday.value
        days?: typeof kvDays.value
      }>(`/api/admin/cloudflare/kv-usage?days=${days.value}`)
      meta.kvNs = data.namespaceId || ''
      if (data.caps) kvCaps.value = data.caps
      kvToday.value = data.today || kvToday.value
      kvDays.value = data.days || []
    } else if (kind === 'workers') {
      const data = await adminApi<{
        scriptName?: string
        caps?: { requests: number }
        today?: typeof workersToday.value
        days?: typeof workersDays.value
      }>(`/api/admin/cloudflare/workers-usage?days=${days.value}`)
      meta.script = data.scriptName || ''
      if (data.caps?.requests) workersCap.value = data.caps.requests
      workersToday.value = data.today || workersToday.value
      workersDays.value = data.days || []
    } else if (kind === 'r2') {
      const data = await adminApi<{
        bucketName?: string
        caps?: typeof r2Caps.value
        storage?: typeof r2Storage.value
        today?: typeof r2Today.value
        days?: typeof r2Days.value
      }>(`/api/admin/cloudflare/r2-usage?days=${days.value}`)
      meta.bucket = data.bucketName || ''
      if (data.caps) r2Caps.value = data.caps
      if (data.storage) r2Storage.value = data.storage
      r2Today.value = data.today || r2Today.value
      r2Days.value = data.days || []
    } else {
      const data = await adminApi<{
        today?: typeof aiToday.value
        days?: typeof aiDays.value
      }>(`/api/admin/cloudflare/ai-usage?days=${days.value}`)
      aiToday.value = data.today || aiToday.value
      aiDays.value = data.days || []
    }
    loaded[kind] = true
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      configHint.value =
        '尚未配置 CF_API_TOKEN。请创建含 Account Analytics Read 的 Token，并执行 wrangler secret put CF_API_TOKEN'
      return
    }
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  void loadTab(tab.value)
}

async function load() {
  loaded.kv = false
  loaded.workers = false
  loaded.r2 = false
  loaded.ai = false
  await loadTab(tab.value, true)
}

onMounted(() => void loadTab('kv'))
</script>

<style scoped>
.stat {
  padding: 14px 16px;
  border: 1px solid var(--admin-line, rgba(27, 36, 48, 0.08));
  border-radius: 10px;
  background: #fff;
  min-height: 96px;
}
.stat-label {
  font-size: 13px;
  color: var(--admin-muted, #6b7785);
}
.stat-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 650;
}
.cap {
  margin-top: 6px;
  font-size: 12px;
  color: var(--admin-muted, #6b7785);
}
.chart-section {
  margin-top: 8px;
}
.section-title {
  margin: 8px 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.chart {
  height: 320px;
  width: 100%;
}
.ns {
  margin-top: 12px;
  font-size: 12px;
}
.muted {
  color: var(--admin-muted, #6b7785);
}
</style>
