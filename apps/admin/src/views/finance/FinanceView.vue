<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>财务统计</h1>
          <p class="sub">基于已支付订单的简易汇总；图表后续再接。</p>
        </div>
        <div class="actions">
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

      <EmptyPlaceholder
        title="图表区域预留"
        description="营收趋势、分档位占比等图表将放在此处。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
import { adminApi, ApiError } from '../../lib/api'

type OrderRow = {
  status: string
  type: string
  totalFee: string
}

const loading = ref(false)
const orders = ref<OrderRow[]>([])

const summary = computed(() => {
  const paid = orders.value.filter((o) => o.status === 'paid')
  const revenue = paid
    .filter((o) => o.type === 'paid' || o.type === 'mock')
    .reduce((sum, o) => sum + Number(o.totalFee || 0), 0)
  return {
    paidCount: paid.length,
    revenue: revenue.toFixed(2),
    freeCount: paid.filter((o) => o.type === 'free').length,
    adminGrantCount: paid.filter((o) => o.type === 'admin_grant').length,
  }
})

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ orders: OrderRow[] }>('/api/admin/orders')
    orders.value = data.orders
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
</style>
