<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="awall">
        <img class="brand-logo" src="/logo.svg" alt="awall" width="32" height="32" />
        <span class="brand-text">awall</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/">壁纸</RouterLink>
        <RouterLink to="/pricing">会员</RouterLink>
        <RouterLink v-if="!authState.user" to="/login">登录</RouterLink>
        <button v-else class="linkish" type="button" @click="onLogout">
          {{ authState.user.email }}
        </button>
      </nav>
    </header>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authState, logout, refreshMe } from './lib/auth'

const router = useRouter()

onMounted(() => {
  void refreshMe()
})

function onLogout() {
  logout()
  void router.push('/')
}
</script>
