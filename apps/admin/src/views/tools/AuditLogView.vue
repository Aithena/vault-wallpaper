<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>全局操作日志</h1>
          <p class="sub">仅管理员后台关键操作；与用户日志、下载记录三分开。</p>
        </div>
        <div class="actions">
          <el-button @click="load">刷新</el-button>
        </div>
      </div>
      <el-table :data="rows" stripe border>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ row.at.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column prop="adminUsername" label="管理员" width="120" />
        <el-table-column prop="action" label="动作" min-width="200" />
        <el-table-column prop="target" label="对象" min-width="180" />
        <el-table-column label="详情" min-width="160">
          <template #default="{ row }">{{ row.detail || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'

type AuditRow = {
  id: string
  at: string
  adminUsername: string
  action: string
  target: string
  detail?: string
}

const loading = ref(false)
const rows = ref<AuditRow[]>([])

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ logs: AuditRow[] }>('/api/admin/audit?limit=200')
    rows.value = data.logs
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
