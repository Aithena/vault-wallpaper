<template>
  <section class="hero">
    <h1>精选壁纸，按年订阅</h1>
    <p>
      列表只展示预览图。原图需登录并开通有效会员后，通过鉴权接口下载，不直接暴露存储地址。
    </p>
  </section>

  <p v-if="loading" class="meta">加载中…</p>
  <p v-else-if="error" class="err">{{ error }}</p>

  <div v-else class="grid">
    <article v-for="item in items" :key="item.id" class="card">
      <img :src="item.previewUrl" :alt="item.title" loading="lazy" />
      <div class="card-body">
        <h3>{{ item.title }}</h3>
        <div class="meta">
          {{ item.width }}×{{ item.height }} · 需 {{ tierLabel(item.tierRequired) }}
        </div>
        <button class="btn block" type="button" :disabled="downloading === item.id" @click="onDownload(item)">
          {{ downloading === item.id ? '处理中…' : '下载原图' }}
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { isMembershipValid, type WallpaperPublic } from '@vault/shared'
import { api, apiUrl, getToken } from '../lib/api'
import { authState } from '../lib/auth'
import { getBrowseSessionId } from '../lib/browse-session'
import { loadSitePublic, tierLabel } from '../lib/site'

const router = useRouter()
const items = ref<WallpaperPublic[]>([])
const loading = ref(true)
const error = ref('')
const downloading = ref<string | null>(null)

onMounted(async () => {
  void loadSitePublic()
  try {
    const data = await api<{ items: WallpaperPublic[] }>('/api/wallpapers')
    items.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

async function onDownload(item: WallpaperPublic) {
  if (!getToken()) {
    await router.push('/login')
    return
  }
  if (!authState.user || !isMembershipValid(authState.user)) {
    await router.push('/pricing')
    return
  }

  downloading.value = item.id
  error.value = ''
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${getToken()}`,
    }
    const browseSessionId = getBrowseSessionId()
    if (browseSessionId) headers['X-Browse-Session-Id'] = browseSessionId
    const res = await fetch(apiUrl(`/api/wallpapers/${item.id}/download`), {
      headers,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        await router.push('/pricing')
        return
      }
      throw new Error((data as { hint?: string; error?: string }).hint || (data as { error?: string }).error || '下载失败')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.id}.jpg`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '下载失败'
  } finally {
    downloading.value = null
  }
}
</script>
