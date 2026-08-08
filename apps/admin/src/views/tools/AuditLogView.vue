<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>全局操作日志</h1>
          <p class="sub">仅管理员后台关键操作；默认近 30 天，最长 365 天。</p>
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

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        class="table-pagination"
        @size-change="onPageSizeChange"
        @current-change="load"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { buildQuery } from '../../lib/query'

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
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

function onPageSizeChange() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const qs = buildQuery({
      page: page.value,
      pageSize: pageSize.value,
    })
    const data = await adminApi<{
      logs: AuditRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/audit${qs}`)
    rows.value = data.logs
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
