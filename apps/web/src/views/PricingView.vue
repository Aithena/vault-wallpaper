<template>
  <section class="hero">
    <h1>会员套餐</h1>
    <p>单次购买续期一年；有效期内再次购买，从到期日继续顺延一年。</p>
  </section>

  <div v-if="!authState.user" class="panel" style="margin-bottom: 20px">
    <p class="hint" style="margin: 0">请先登录后再开通。</p>
    <div style="margin-top: 14px">
      <RouterLink class="btn" to="/login">去登录</RouterLink>
    </div>
  </div>

  <div
    v-else-if="authState.user.memberStatus === 'active' && authState.user.memberExpiresAt"
    class="panel"
    style="margin-bottom: 20px"
  >
    <p class="hint" style="margin: 0">
      当前档位：{{ tierLabel(authState.user.memberTier) }} · 有效期至
      {{ formatExpire(authState.user.memberExpiresAt) }}
    </p>
  </div>

  <div class="price-grid">
    <article v-for="tier in tiers" :key="tier.id" class="price-card">
      <div>{{ tier.label }}</div>
      <div class="price">{{ priceText(tier.priceYuan) }}</div>
      <div class="desc">{{ descMap[tier.id] }}</div>
      <button
        class="btn block"
        type="button"
        :disabled="!authState.user || buying === tier.id"
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
import {
  MEMBERSHIP_TIERS,
  isMembershipValid,
  type MembershipTierId,
} from '@vault/shared'
import { api } from '../lib/api'
import { authState, refreshMe } from '../lib/auth'

const router = useRouter()
const tiers = Object.values(MEMBERSHIP_TIERS)
const buying = ref<MembershipTierId | null>(null)
const message = ref('')
const error = ref('')

const descMap: Record<MembershipTierId, string> = {
  free: '限时免费体验',
  basic: '解锁基础档壁纸原图，有效期一年。',
  pro: '解锁进阶及以下档位原图，有效期一年。',
  max: '解锁全部壁纸原图，有效期一年。',
}

function priceText(priceYuan: string) {
  if (priceYuan === '0.00' || priceYuan === '0') return '免费'
  return `¥${priceYuan}`
}

function tierLabel(tier: MembershipTierId | null) {
  if (!tier) return '—'
  return MEMBERSHIP_TIERS[tier].label
}

function formatExpire(iso: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function buttonText(tier: MembershipTierId) {
  if (buying.value === tier) {
    return tier === 'free' ? '开通中…' : '处理中…'
  }
  const u = authState.user
  if (u && isMembershipValid(u) && u.memberTier === tier) {
    return '续费一年'
  }
  return tier === 'free' ? '免费开通一年' : '购买一年'
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
      message.value = '免费档已开通一年'
      await router.push({ path: '/pay/result', query: { orderId: data.orderId } })
      return
    }

    if (data.mode === 'mock') {
      await api('/api/pay/mock-complete', {
        method: 'POST',
        body: JSON.stringify({ orderId: data.orderId }),
      })
      await refreshMe()
      message.value = '开通成功，有效期一年'
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
