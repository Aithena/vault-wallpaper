<template>
  <section class="hero">
    <h1>会员套餐</h1>
    <p>
      {{
        siteState.config.purchaseNotice ||
        '单次购买续期一年；有效期内再次购买，从到期日继续顺延一年。'
      }}
    </p>
  </section>

  <div v-if="!siteState.config.purchaseEnabled" class="panel" style="margin-bottom: 20px">
    <p class="hint" style="margin: 0">当前暂未开放购买，仅可浏览或开通免费档（若仍开放）。</p>
  </div>

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
    <article v-for="tier in siteState.tiers" :key="tier.id" class="price-card">
      <div>{{ tier.label }}</div>
      <div class="price">{{ priceText(tier.priceYuan) }}</div>
      <div class="desc">{{ tier.benefit || '—' }}</div>
      <button
        class="btn block"
        type="button"
        :disabled="!canBuy(tier.id) || buying === tier.id"
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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { isMembershipValid, type MembershipTierId } from '@vault/shared'
import { api } from '../lib/api'
import { authState, refreshMe } from '../lib/auth'
import { loadSitePublic, siteState, tierLabel } from '../lib/site'

const router = useRouter()
const buying = ref<MembershipTierId | null>(null)
const message = ref('')
const error = ref('')

onMounted(() => {
  void loadSitePublic()
})

function priceText(priceYuan: string) {
  if (priceYuan === '0.00' || priceYuan === '0') return '免费'
  return `¥${priceYuan}`
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

function canBuy(tier: MembershipTierId) {
  if (!authState.user) return false
  if (tier === 'free') return true
  return siteState.config.purchaseEnabled
}

function buttonText(tier: MembershipTierId) {
  if (buying.value === tier) {
    return tier === 'free' ? '开通中…' : '处理中…'
  }
  if (tier !== 'free' && !siteState.config.purchaseEnabled) {
    return '暂未开放'
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
    const code = e instanceof Error ? e.message : '下单失败'
    if (code === 'purchase_disabled') error.value = '暂未开放购买'
    else if (code === 'tier_not_on_sale') error.value = '该档位已下架'
    else if (code === 'blacklisted') error.value = '账号已被限制购买'
    else error.value = code
  } finally {
    buying.value = null
  }
}
</script>
