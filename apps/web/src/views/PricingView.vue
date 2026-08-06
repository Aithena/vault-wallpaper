<template>
  <section class="hero">
    <h1>终身会员</h1>
    <p>一次买断，按档位解锁对应壁纸原图下载。当前可先开通免费档体验。</p>
  </section>

  <div v-if="!authState.user" class="panel" style="margin-bottom: 20px">
    <p class="hint" style="margin: 0">请先登录后再开通。</p>
    <div style="margin-top: 14px">
      <RouterLink class="btn" to="/login">去登录</RouterLink>
    </div>
  </div>

  <div class="price-grid">
    <article v-for="tier in tiers" :key="tier.id" class="price-card">
      <div>{{ tier.label }}</div>
      <div class="price">{{ priceText(tier.priceYuan) }}</div>
      <div class="desc">{{ descMap[tier.id] }}</div>
      <button
        class="btn block"
        type="button"
        :disabled="!authState.user || buying === tier.id || isCurrent(tier.id)"
        @click="buy(tier.id)"
      >
        {{ buttonText(tier.id) }}
      </button>
    </article>
  </div>

  <p v-if="message" class="msg">{{ message }}</p>
  <p v-if="error" class="err">{{ error }}</p>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MEMBERSHIP_TIERS, type MembershipTierId } from '@vault/shared'
import { api } from '../lib/api'
import { authState, refreshMe } from '../lib/auth'

const router = useRouter()
const tiers = Object.values(MEMBERSHIP_TIERS)
const buying = ref<MembershipTierId | null>(null)
const message = ref('')
const error = ref('')

const descMap: Record<MembershipTierId, string> = {
  free: '免费体验，可下载免费档壁纸原图。',
  basic: '解锁基础档壁纸原图，终身有效。',
  pro: '解锁进阶及以下档位原图。',
  max: '解锁全部壁纸原图下载。',
}

function priceText(priceYuan: string) {
  if (priceYuan === '0.00' || priceYuan === '0') return '免费'
  return `¥${priceYuan}`
}

function isCurrent(tier: MembershipTierId) {
  return (
    authState.user?.memberStatus === 'active' &&
    authState.user.memberTier === tier
  )
}

function buttonText(tier: MembershipTierId) {
  if (isCurrent(tier)) return '当前档位'
  if (buying.value === tier) {
    return tier === 'free' ? '开通中…' : '创建订单…'
  }
  return tier === 'free' ? '免费开通' : '立即开通'
}

async function buy(tier: MembershipTierId) {
  error.value = ''
  message.value = ''
  buying.value = tier
  try {
    const data = await api<{
      mode: string
      orderId: string
      mockPayUrl?: string
      message?: string
    }>('/api/pay/create', {
      method: 'POST',
      body: JSON.stringify({ tier }),
    })

    if (data.mode === 'free') {
      await refreshMe()
      message.value = '免费档已开通'
      await router.push({ path: '/pay/result', query: { orderId: data.orderId } })
      return
    }

    if (data.mode === 'mock') {
      await api('/api/pay/mock-complete', {
        method: 'POST',
        body: JSON.stringify({ orderId: data.orderId }),
      })
      await refreshMe()
      message.value = '模拟支付成功，会员已开通'
      await router.push({ path: '/pay/result', query: { orderId: data.orderId } })
      return
    }

    message.value = '已创建虎皮椒订单，请按返回参数完成跳转支付（待接前端表单提交）'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下单失败'
  } finally {
    buying.value = null
  }
}
</script>
