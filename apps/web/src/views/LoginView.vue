<template>
  <section class="panel">
    <h1>邮箱登录</h1>
    <p class="hint">输入邮箱获取验证码。未配置发信服务时，验证码会在接口响应里返回（仅实验环境）。</p>

    <div class="field">
      <label for="email">邮箱</label>
      <input id="email" v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" />
    </div>

    <div class="field">
      <label for="code">验证码</label>
      <input id="code" v-model.trim="code" inputmode="numeric" maxlength="6" placeholder="6 位数字" />
    </div>

    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      <button class="btn ghost" type="button" :disabled="sending" @click="sendCode">
        {{ sending ? '发送中…' : '获取验证码' }}
      </button>
      <button class="btn" type="button" :disabled="verifying" @click="verify">
        {{ verifying ? '登录中…' : '登录' }}
      </button>
    </div>

    <p v-if="previewCode" class="msg">开发预览验证码：{{ previewCode }}</p>
    <p v-if="message" class="msg">{{ message }}</p>
    <p v-if="error" class="err">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken } from '../lib/api'
import { refreshMe } from '../lib/auth'

const router = useRouter()
const email = ref('')
const code = ref('')
const previewCode = ref('')
const message = ref('')
const error = ref('')
const sending = ref(false)
const verifying = ref(false)

async function sendCode() {
  error.value = ''
  message.value = ''
  previewCode.value = ''
  sending.value = true
  try {
    const data = await api<{ ok: boolean; previewCode?: string }>('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email: email.value }),
    })
    message.value = '验证码已发送'
    if (data.previewCode) previewCode.value = data.previewCode
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送失败'
  } finally {
    sending.value = false
  }
}

async function verify() {
  error.value = ''
  verifying.value = true
  try {
    const data = await api<{
      token: string
    }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email: email.value, code: code.value }),
    })
    setToken(data.token)
    await refreshMe()
    await router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    verifying.value = false
  }
}
</script>
