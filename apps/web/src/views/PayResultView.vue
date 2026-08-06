<template>
  <section class="panel">
    <h1>开通结果</h1>
    <p class="hint">订单号：{{ orderId || '—' }}</p>
    <p v-if="loading">正在查询订单状态…</p>
    <template v-else-if="order">
      <p class="msg">
        状态：{{ order.status }} · 档位：{{ order.tier }} ·
        {{ order.totalFee === '0.00' ? '免费' : `¥${order.totalFee}` }}
      </p>
      <p v-if="authState.user?.memberExpiresAt" class="hint">
        会员有效期至：{{ formatExpire(authState.user.memberExpiresAt) }}
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
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api'
import { authState, refreshMe } from '../lib/auth'

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
  await refreshMe()
  if (!orderId) {
    loading.value = false
    error.value = '缺少 orderId'
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
