<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>财务统计</h1>
          <p class="sub">
            基于已支付订单汇总；默认近 {{ days }} 天，最长可查 365 天。
          </p>
        </div>
        <div class="actions">
          <el-radio-group v-model="days" size="small" @change="load">
            <el-radio-button :value="30">30 天</el-radio-button>
            <el-radio-button :value="90">90 天</el-radio-button>
            <el-radio-button :value="180">180 天</el-radio-button>
            <el-radio-button :value="365">365 天</el-radio-button>
          </el-radio-group>
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-row :gutter="16" style="margin-bottom: 20px">
        <el-col :span="6">
          <div class="stat">
            <div class="stat-label">已支付订单</div>
            <div class="stat-value">{{ summary.paidCount }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat">
            <div class="stat-label">实收合计（元）</div>
            <div class="stat-value">{{ summary.revenue }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat">
            <div class="stat-label">免费开通</div>
            <div class="stat-value">{{ summary.freeCount }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat">
            <div class="stat-label">后台开通</div>
            <div class="stat-value">{{ summary.adminGrantCount }}</div>
          </div>
        </el-col>
      </el-row>

      <div class="charts">
        <section class="chart-section">
          <h3 class="section-title">近 {{ days }} 天营收趋势</h3>
          <VChart class="chart" :option="trendOption" autoresize />
        </section>

        <section class="chart-section">
          <h3 class="section-title">分档位占比</h3>
          <VChart class="chart" :option="tierPieOption" autoresize />
        </section>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

type FinanceSummary = {
  paidCount: number
  revenue: string
  freeCount: number
  adminGrantCount: number
}

type TrendPoint = {
  date: string
  revenue: string
  paidCount: number
}

type TierStat = {
  tier: string
  count: number
  revenue: string
}

const loading = ref(false)
const days = ref(30)
const summary = ref<FinanceSummary>({
  paidCount: 0,
  revenue: '0.00',
  freeCount: 0,
  adminGrantCount: 0,
})
const trend = ref<TrendPoint[]>([])
const byTier = ref<TierStat[]>([])

const trendOption = computed<ECOption>(() => ({
  color: ['#409eff', '#67c23a'],
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross' },
  },
  legend: {
    data: ['营收', '订单数'],
    bottom: 0,
  },
  grid: {
    left: 48,
    right: 48,
    top: 24,
    bottom: 48,
  },
  xAxis: {
    type: 'category',
    data: trend.value.map((t) => t.date.slice(5)),
    axisLabel: {
      interval: 'auto',
      rotate: 40,
      fontSize: 11,
    },
  },
  yAxis: [
    {
      type: 'value',
      name: '元',
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    {
      type: 'value',
      name: '单',
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: '营收',
      type: 'bar',
      data: trend.value.map((t) => Number(t.revenue || 0)),
      barMaxWidth: 14,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    },
    {
      name: '订单数',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: trend.value.map((t) => t.paidCount),
    },
  ],
}))

const tierPieOption = computed<ECOption>(() => {
  const data = byTier.value.map((t) => ({
    name: t.tier,
    value: t.count,
    revenue: t.revenue,
  }))
  return {
    color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#b37feb'],
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as {
          name: string
          value: number
          percent: number
          data: { revenue?: string }
        }
        const revenue = p.data?.revenue ?? '0.00'
        return `${p.name}<br/>订单 ${p.value}（${p.percent}%）<br/>营收 ¥${revenue}`
      },
    },
    legend: {
      orient: 'vertical',
      right: 8,
      top: 'middle',
      type: 'scroll',
    },
    series: [
      {
        name: '档位占比',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          formatter: '{b}\n{d}%',
          fontSize: 12,
        },
        data: data.length
          ? data
          : [{ name: '暂无数据', value: 0, revenue: '0.00' }],
      },
    ],
  }
})

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{
      summary: FinanceSummary
      trend: TrendPoint[]
      byTier: TierStat[]
      range?: { from: string; to: string; days: number }
    }>(`/api/admin/dashboard/finance?days=${days.value}`)
    summary.value = data.summary
    trend.value = data.trend
    byTier.value = data.byTier
    if (data.range?.days) days.value = data.range.days
  } catch (e) {
    const code = e instanceof ApiError ? e.code : '加载失败'
    ElMessage.error(
      code === 'range_too_long'
        ? '查询跨度不能超过 365 天'
        : code === 'invalid_range' || code === 'invalid_date'
          ? '日期范围无效'
          : code,
    )
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.stat {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
}
.charts {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
}
@media (max-width: 960px) {
  .charts {
    grid-template-columns: 1fr;
  }
}
.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}
.chart-section {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.chart {
  width: 100%;
  height: 360px;
}
</style>
