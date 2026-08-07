<template>
  <section class="panel">
    <h1>{{ headline }}</h1>
    <p v-if="loading">正在查询订单状态…</p>
    <template v-else-if="order">
      <p class="hint">订单号：{{ order.id }}</p>
      <p class="msg">{{ statusLine }}</p>
      <p class="hint">会员档位：{{ tierLabel }}</p>
      <p v-if="amountLine" class="hint">{{ amountLine }}</p>
      <p v-if="authState.user?.memberExpiresAt" class="hint">
        有效期至：{{ formatExpire(authState.user.memberExpiresAt) }}
      </p>
    </template>
    <p v-else-if="error" class="err">{{ error }}</p>
    <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap">
      <RouterLink class="btn" to="/">去下载壁纸</RouterLink>
      <RouterLink class="btn ghost" to="/pricing">返回会员页</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api'
import { authState, refreshMe } from '../lib/auth'
import { loadSitePublic, tierLabel as resolveTierLabel } from '../lib/site'

const route = useRoute()
const orderId = String(route.query.orderId || '')
const loading = ref(true)
const error = ref('')
const order = ref<{
  id: string
  status: string
  tier: string
  totalFee: string
} | null>(null)

const isFree = computed(
  () => order.value?.totalFee === '0.00' || order.value?.totalFee === '0' || order.value?.tier === 'free',
)

const headline = computed(() => {
  if (!order.value) return '开通结果'
  if (order.value.status !== 'paid') return '开通结果'
  return isFree.value ? '开通成功' : '支付成功'
})

const statusLine = computed(() => {
  if (!order.value) return ''
  if (order.value.status === 'paid') {
    return isFree.value ? '状态：已开通' : '状态：支付成功'
  }
  if (order.value.status === 'pending') return '状态：待支付'
  if (order.value.status === 'refunded') return '状态：已退款'
  return `状态：${order.value.status}`
})

const tierLabel = computed(() => resolveTierLabel(order.value?.tier))

const amountLine = computed(() => {
  if (!order.value || isFree.value) return ''
  return `支付金额：¥${order.value.totalFee}`
})

function formatExpire(iso: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

onMounted(async () => {
  void loadSitePublic()
  await refreshMe()
  if (!orderId) {
    loading.value = false
    error.value = '缺少订单号'
    return
  }
  try {
    const data = await api<{ order: typeof order.value }>(`/api/pay/order/${orderId}`)
    order.value = data.order
  } catch (e) {
    error.value = e instanceof Error ? e.message : '查询失败'
  } finally {
    loading.value = false
  }
})
</script>
