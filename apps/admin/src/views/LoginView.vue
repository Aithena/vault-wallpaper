<template>
  <div class="login-page">
    <el-card class="login-card" shadow="hover">
      <div class="brand">
        <img class="brand-logo" src="/logo.svg" alt="awall" width="36" height="36" />
        <h1>Awall 管理后台</h1>
      </div>

      <template v-if="mode === 'login'">
        <p class="hint">使用用户名登录；绑定邮箱仅用于重置密码。</p>
        <el-form label-position="top" @submit.prevent="onLogin">
          <el-form-item label="用户名">
            <el-input v-model="username" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="password"
              type="password"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>
          <el-button type="primary" class="submit" native-type="submit" :loading="loading">
            登录
          </el-button>
          <el-button link type="primary" class="reset-link" @click="toReset">
            忘记密码？用绑定邮箱重置
          </el-button>
        </el-form>
      </template>

      <template v-else>
        <p class="hint">输入绑定邮箱获取验证码，再设置新密码。</p>
        <el-form label-position="top" @submit.prevent="onResetConfirm">
          <el-form-item label="绑定邮箱">
            <el-input v-model="resetEmail" type="email" autocomplete="email" />
          </el-form-item>
          <el-form-item label="验证码">
            <div class="code-row">
              <el-input v-model="resetCode" />
              <el-button :loading="sending" :disabled="cooldown > 0" @click="onSendCode">
                {{ cooldown > 0 ? `${cooldown}s` : '获取验证码' }}
              </el-button>
            </div>
            <p v-if="previewCode" class="preview">开发预览验证码：{{ previewCode }}</p>
          </el-form-item>
          <el-form-item label="新密码">
            <el-input
              v-model="newPassword"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
          <el-button type="primary" class="submit" native-type="submit" :loading="resetting">
            提交重置
          </el-button>
          <el-button link type="primary" class="reset-link" @click="toLogin">返回登录</el-button>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  confirmPasswordReset,
  loginAdmin,
  requestPasswordReset,
} from '../lib/auth'

const router = useRouter()
const route = useRoute()

const mode = ref<'login' | 'reset'>('login')
const username = ref('admin')
const password = ref('')
const resetEmail = ref('')
const resetCode = ref('')
const newPassword = ref('')
const previewCode = ref('')
const loading = ref(false)
const sending = ref(false)
const resetting = ref(false)
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function toReset() {
  mode.value = 'reset'
}

function toLogin() {
  mode.value = 'login'
}

function startCooldown() {
  cooldown.value = 60
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

async function onLogin() {
  loading.value = true
  const result = await loginAdmin(username.value, password.value)
  loading.value = false
  if (!result.ok) {
    ElMessage.error(result.message)
    return
  }
  ElMessage.success('登录成功')
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/wallpapers'
  void router.replace(redirect)
}

async function onSendCode() {
  sending.value = true
  const result = await requestPasswordReset(resetEmail.value)
  sending.value = false
  if (!result.ok) {
    ElMessage.error(result.message || '发送失败')
    return
  }
  previewCode.value = result.previewCode || ''
  ElMessage.success(previewCode.value ? '已发送（见下方预览码）' : '若邮箱已绑定，验证码已发送')
  startCooldown()
}

async function onResetConfirm() {
  resetting.value = true
  const result = await confirmPasswordReset({
    email: resetEmail.value,
    code: resetCode.value,
    newPassword: newPassword.value,
  })
  resetting.value = false
  if (!result.ok) {
    ElMessage.error(result.message || '重置失败')
    return
  }
  ElMessage.success('密码已重置，请登录')
  toLogin()
  password.value = ''
}
</script>

<style scoped lang="less">
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-card {
  width: min(400px, 100%);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
}

.brand-logo {
  width: 36px;
  height: 36px;
  display: block;
  border-radius: 8px;
}

.hint {
  margin: 0 0 12px;
  color: var(--admin-muted);
  font-size: 13px;
  line-height: 1.5;
}

.submit {
  width: 100%;
}

.reset-link {
  width: 100%;
  margin-left: 0 !important;
  margin-top: 8px;
}

.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.preview {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--admin-muted);
}
</style>
