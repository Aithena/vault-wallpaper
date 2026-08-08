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
        <el-select v-model="filters.success" style="width: 120px" @change="onFilterChange">
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
          style="width: 248px"
          :disabled-date="disabledDate"
          @calendar-change="onCalendarChange"
          @change="onDateRangeChange"
        />
        <el-input
          v-model="filters.q"
          clearable
          placeholder="邮箱 / 壁纸 ID / 标题"
          style="width: 240px"
          @change="onFilterChange"
          @clear="onFilterChange"
        />
      </div>

      <el-table :data="rows" stripe border>
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
      <p v-if="!loading && !rows.length" class="empty-hint">暂无下载记录</p>

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
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import {
  defaultDateRange,
  isDateRangeTooLong,
  makeRangeDisabledDate,
} from '../../lib/date-range'
import { buildQuery } from '../../lib/query'

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
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dateRange = ref<[string, string] | null>(defaultDateRange())
const rangePickAnchor = ref<Date | null>(null)
const disabledDate = makeRangeDisabledDate(() => rangePickAnchor.value)
const filters = reactive({ success: 'all', q: '' })

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function onCalendarChange(val: [Date, Date | null] | null) {
  rangePickAnchor.value = val?.[0] ?? null
}

function onDateRangeChange() {
  rangePickAnchor.value = null
  if (!dateRange.value) {
    dateRange.value = defaultDateRange()
  } else if (isDateRangeTooLong(dateRange.value)) {
    ElMessage.warning('时间范围最长 365 天')
    dateRange.value = defaultDateRange()
  }
  onFilterChange()
}

function onFilterChange() {
  page.value = 1
  load()
}

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
      q: filters.q.trim(),
      success: filters.success,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    const data = await adminApi<{
      downloads: DownloadRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/downloads${qs}`)
    rows.value = data.downloads
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
.empty-hint {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
