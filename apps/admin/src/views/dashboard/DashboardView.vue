<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>数据总览</h1>
          <p class="sub">用户、订单、待审壁纸、下载、AI 调用等核心指标。</p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-row :gutter="16">
        <el-col v-for="card in cards" :key="card.label" :xs="12" :sm="8" :md="6">
          <div class="metric" @click="card.to && $router.push(card.to)">
            <div class="metric-label">{{ card.label }}</div>
            <div class="metric-value">{{ card.value }}</div>
            <div v-if="card.hint" class="metric-hint">{{ card.hint }}</div>
          </div>
        </el-col>
      </el-row>

      <h3 class="section-title">快捷入口</h3>
      <el-space wrap>
        <el-button @click="$router.push('/wallpapers')">壁纸列表</el-button>
        <el-button @click="$router.push('/users')">用户列表</el-button>
        <el-button @click="$router.push('/orders')">全部订单</el-button>
        <el-button @click="$router.push('/downloads')">下载记录</el-button>
        <el-button @click="$router.push('/tools/ai-usage')">AI 使用统计</el-button>
        <el-button @click="$router.push('/tools/audit')">操作日志</el-button>
      </el-space>

      <h3 class="section-title">最近操作</h3>
      <el-table :data="recentAudits" stripe border size="small">
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </el-table-column>
        <el-table-column prop="adminUsername" label="管理员" width="120" />
        <el-table-column prop="action" label="动作" min-width="180" />
        <el-table-column prop="target" label="对象" min-width="160" />
      </el-table>
      <p v-if="!loading && !recentAudits.length" class="empty-hint">暂无操作日志</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'

type Overview = {
  usersTotal: number
  usersDisabled: number
  usersBlacklisted: number
  paidMembers: number
  ordersTotal: number
  ordersToday: number
  ordersPaid: number
  ordersPending: number
  revenueTotal: string
  revenueToday: string
  wallpapersTotal: number
  wallpapersPending: number
  wallpapersPublished: number
  downloadsTotal: number
  downloadsToday: number
  downloadsSuccessToday: number
  aiTotal: number
  aiToday: number
  aiSuccessToday: number
  aiFailedToday: number
  aiAvgDurationMs: number
}

type AuditRow = {
  id: string
  at: string
  adminUsername: string
  action: string
  target: string
}

const loading = ref(false)
const overview = ref<Overview | null>(null)
const recentAudits = ref<AuditRow[]>([])

const cards = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    {
      label: '用户总数',
      value: String(o.usersTotal),
      hint: `禁用 ${o.usersDisabled} · 拉黑 ${o.usersBlacklisted}`,
      to: '/users',
    },
    {
      label: '付费会员',
      value: String(o.paidMembers),
      hint: '当前有效且非 free',
      to: '/users',
    },
    {
      label: '今日订单',
      value: String(o.ordersToday),
      hint: `待支付 ${o.ordersPending} · 已付 ${o.ordersPaid}`,
      to: '/orders',
    },
    {
      label: '今日营收（元）',
      value: o.revenueToday,
      hint: `累计 ¥${o.revenueTotal}`,
      to: '/finance',
    },
    {
      label: '待审壁纸',
      value: String(o.wallpapersPending),
      hint: `已上架 ${o.wallpapersPublished} / 共 ${o.wallpapersTotal}`,
      to: '/wallpapers',
    },
    {
      label: '今日下载',
      value: String(o.downloadsToday),
      hint: `成功 ${o.downloadsSuccessToday} · 累计 ${o.downloadsTotal}`,
      to: '/downloads',
    },
    {
      label: '今日 AI 调用',
      value: String(o.aiToday),
      hint: `成功 ${o.aiSuccessToday} · 失败 ${o.aiFailedToday} · 累计 ${o.aiTotal}`,
      to: '/tools/ai-usage',
    },
  ]
})

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ overview: Overview; recentAudits: AuditRow[] }>(
      '/api/admin/dashboard/overview',
    )
    overview.value = data.overview
    recentAudits.value = data.recentAudits
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.metric {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  min-height: 96px;
}
.metric:hover {
  border-color: var(--el-color-primary-light-5);
}
.metric-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.metric-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}
.metric-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.section-title {
  margin: 8px 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.empty-hint {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
