<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>下载记录</h1>
          <p class="sub">只读：用户、壁纸、当时档位、是否成功。由 C 端下载接口自动打点。</p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select v-model="filters.success" style="width: 120px">
          <el-option label="全部结果" value="all" />
          <el-option label="成功" value="yes" />
          <el-option label="失败" value="no" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="起"
          end-placeholder="止"
          value-format="YYYY-MM-DD"
        />
        <el-input
          v-model="filters.q"
          clearable
          placeholder="邮箱 / 壁纸 ID / 标题"
          style="width: 240px"
        />
      </div>

      <el-table :data="filtered" stripe border>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="email" label="用户" min-width="160" />
        <el-table-column prop="wallpaperTitle" label="壁纸" min-width="120" />
        <el-table-column prop="wallpaperId" label="壁纸 ID" min-width="120" />
        <el-table-column label="当时档位" width="100">
          <template #default="{ row }">{{ row.tierAtTime ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="140">
          <template #default="{ row }">{{ row.success ? '—' : row.error || '—' }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!loading && !filtered.length" class="empty-hint">暂无下载记录</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'

type DownloadRow = {
  id: string
  email: string
  wallpaperId: string
  wallpaperTitle: string
  tierAtTime: string | null
  success: boolean
  error?: string
  createdAt: string
}

const loading = ref(false)
const rows = ref<DownloadRow[]>([])
const dateRange = ref<[string, string] | null>(null)
const filters = reactive({ success: 'all', q: '' })

const filtered = computed(() =>
  rows.value.filter((r) => {
    if (filters.success === 'yes' && !r.success) return false
    if (filters.success === 'no' && r.success) return false
    const q = filters.q.trim().toLowerCase()
    if (
      q &&
      !r.email.toLowerCase().includes(q) &&
      !r.wallpaperId.toLowerCase().includes(q) &&
      !r.wallpaperTitle.toLowerCase().includes(q)
    ) {
      return false
    }
    if (dateRange.value) {
      const [from, to] = dateRange.value
      const day = r.createdAt.slice(0, 10)
      if (day < from || day > to) return false
    }
    return true
  }),
)

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ downloads: DownloadRow[] }>(
      '/api/admin/downloads?limit=500',
    )
    rows.value = data.downloads
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.empty-hint {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
