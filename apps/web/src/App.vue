<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/" :aria-label="siteState.config.siteName">
        <img
          class="brand-logo"
          src="/logo.svg"
          :alt="siteState.config.siteName"
          width="32"
          height="32"
        />
        <span class="brand-text">{{ siteState.config.siteName }}</span>
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

    <div v-if="siteState.announcements.length" class="announcement-bar">
      <div
        v-for="item in siteState.announcements.slice(0, 3)"
        :key="item.id"
        class="announcement-item"
      >
        <strong>{{ item.title }}</strong>
        <span v-if="item.content"> — {{ item.content }}</span>
      </div>
    </div>

    <main class="main">
      <RouterView />
    </main>

    <footer class="site-footer">
      <p>{{ siteState.config.copyright }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authState, logout, refreshMe } from './lib/auth'
import { trackPage } from './lib/presence'
import { trackVisitorPageview } from './lib/visitor-analytics'
import { loadSitePublic, siteState } from './lib/site'

const router = useRouter()

onMounted(() => {
  void refreshMe()
  void loadSitePublic()
})

router.afterEach((to) => {
  const label =
    to.name === 'home'
      ? '壁纸列表'
      : to.name === 'pricing'
        ? '会员页'
        : to.name === 'pay-result'
          ? '支付结果'
          : to.name === 'login'
            ? '登录页'
            : String(to.name || to.path)
  void trackVisitorPageview(to.fullPath, label)
  if (authState.user) {
    void trackPage(to.fullPath, label)
  }
})

async function onLogout() {
  await logout()
  void router.push('/')
}
</script>
