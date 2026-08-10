<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>壁纸列表</h1>
          <p class="sub">状态：待审核 / 已驳回 / 已上架 / 已下架。上传预览后 AI 异步识别；待审请先「审核确认」再通过。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('wallpapers.list.upload')"
            type="primary"
            @click="$router.push('/wallpapers/new')"
          >
            单张上传
          </el-button>
          <el-button
            v-if="hasButton('wallpapers.list.upload')"
            @click="$router.push('/wallpapers/batch')"
          >
            批量上传
          </el-button>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-select
          v-model="filters.status"
          placeholder="状态"
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option label="全部" value="all" />
          <el-option label="待审核" value="pending" />
          <el-option label="已驳回" value="rejected" />
          <el-option label="已上架" value="published" />
          <el-option label="已下架" value="unpublished" />
        </el-select>
        <el-select
          v-model="filters.category"
          placeholder="分类"
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option label="全部" value="all" />
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.name" />
        </el-select>
        <el-select
          v-model="filters.aiStatus"
          placeholder="AI 状态"
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option label="全部 AI" value="all" />
          <el-option label="未识别" value="idle" />
          <el-option label="识别中" value="pending" />
          <el-option label="已就绪" value="ready" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-input
          v-model="filters.q"
          clearable
          placeholder="搜索标题"
          style="width: 200px"
          @change="onFilterChange"
          @clear="onFilterChange"
        />
      </div>

      <div v-if="selected.length" style="margin-bottom: 12px">
        <el-alert :title="`已选 ${selected.length} 项`" type="info" show-icon :closable="false">
          <template #default>
            <el-space wrap>
              <el-button
                v-if="hasButton('wallpapers.list.batch')"
                size="small"
                type="primary"
                @click="batch('approve')"
              >
                批量审核通过
              </el-button>
              <el-button
                v-if="hasButton('wallpapers.list.batch')"
                size="small"
                @click="batch('unpublish')"
              >
                批量下架
              </el-button>
              <el-button
                v-if="hasButton('wallpapers.list.batch')"
                size="small"
                type="danger"
                @click="batch('delete')"
              >
                批量删除
              </el-button>
              <el-button
                v-if="hasButton('wallpapers.list.batch')"
                size="small"
                @click="batchSetCategory"
              >
                批量改分类
              </el-button>
            </el-space>
          </template>
        </el-alert>
      </div>

      <el-table :data="rows" stripe border @selection-change="onSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column label="预览" width="80">
          <template #default="{ row }">
            <img
              v-if="row.thumbUrl || row.previewUrl"
              class="thumb"
              :src="apiUrl(row.thumbUrl || row.previewUrl)"
              :alt="row.title"
            />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="120" />
        <el-table-column prop="id" label="ID" min-width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="tierRequired" label="档位" width="80" />
        <el-table-column label="分类" width="90">
          <template #default="{ row }">{{ row.category || '—' }}</template>
        </el-table-column>
        <el-table-column label="标签" min-width="120">
          <template #default="{ row }">{{ (row.tags || []).join('、') || '—' }}</template>
        </el-table-column>
        <el-table-column label="尺寸" width="110">
          <template #default="{ row }">{{ row.width }}×{{ row.height }}</template>
        </el-table-column>
        <el-table-column label="原图" width="90">
          <template #default="{ row }">
            <el-tag :type="row.hasOriginal ? 'success' : 'danger'" size="small">
              {{ row.hasOriginal ? '已传' : '缺失' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI" width="90">
          <template #default="{ row }">
            <el-tag :type="aiTagType(row.aiStatus)" size="small">
              {{ aiLabel(row.aiStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="240">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('wallpapers.list.edit') && row.status === 'pending'"
              link
              type="primary"
              @click="$router.push(`/wallpapers/${row.id}`)"
            >
              审核确认
            </el-button>
            <el-button
              v-if="
                hasButton('wallpapers.list.approve') &&
                row.status === 'pending' &&
                row.hasOriginal
              "
              link
              type="primary"
              @click="setStatus(row as WallpaperRow, 'published')"
            >
              通过
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.list.reject') && row.status === 'pending'"
              link
              type="warning"
              @click="reject(row as WallpaperRow)"
            >
              驳回
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.list.unpublish') && row.status === 'published'"
              link
              @click="setStatus(row as WallpaperRow, 'unpublished')"
            >
              下架
            </el-button>
            <el-button
              v-if="
                hasButton('wallpapers.list.edit') &&
                (row.status === 'unpublished' || row.status === 'rejected')
              "
              link
              type="primary"
              @click="resubmit(row as WallpaperRow)"
            >
              提审
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.list.upload') && !row.hasOriginal"
              link
              type="primary"
              @click="openReupload(row as WallpaperRow)"
            >
              补传
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.list.edit') && row.status !== 'pending'"
              link
              type="primary"
              @click="$router.push(`/wallpapers/${row.id}`)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.list.delete')"
              link
              type="danger"
              @click="remove(row as WallpaperRow)"
            >
              删除
            </el-button>
          </template>
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
    </div>

    <el-dialog v-model="reuploadVisible" title="补传原图" width="420px" destroy-on-close>
      <p style="margin-bottom: 12px">壁纸 ID：{{ reuploadId }}</p>
      <input type="file" accept="image/jpeg,image/jpg,.jpg,.jpeg" @change="onReuploadPick" />
      <template #footer>
        <el-button @click="reuploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="reuploading" :disabled="!reuploadFile" @click="submitReupload">
          上传
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryDialogVisible" title="批量改分类" width="420px" destroy-on-close>
      <el-select v-model="categoryPick" clearable placeholder="选择分类（可清空）" style="width: 100%">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSetCategory">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, adminUpload, apiUrl, ApiError } from '../../lib/api'
import { buildQuery } from '../../lib/query'
import { usePermission } from '../../lib/permission'

type WallpaperRow = {
  id: string
  title: string
  previewUrl: string
  thumbUrl?: string
  mediumUrl?: string
  status: string
  tierRequired: string
  category: string | null
  tags: string[]
  width: number
  height: number
  hasOriginal: boolean
  updatedAt: string
  aiStatus?: 'idle' | 'pending' | 'ready' | 'failed'
}

type CategoryRow = { id: string; name: string }

const { hasButton } = usePermission()
const route = useRoute()
const loading = ref(false)
const rows = ref<WallpaperRow[]>([])
const categories = ref<CategoryRow[]>([])
const selected = ref<WallpaperRow[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({
  status: typeof route.query.status === 'string' ? route.query.status : 'all',
  category: 'all',
  aiStatus: typeof route.query.aiStatus === 'string' ? route.query.aiStatus : 'all',
  q: '',
})

const reuploadVisible = ref(false)
const reuploadId = ref('')
const reuploadFile = ref<File | null>(null)
const reuploading = ref(false)

function onSelectionChange(vals: WallpaperRow[]) {
  selected.value = vals
}

function statusLabel(s: string) {
  return (
    { pending: '待审核', rejected: '已驳回', published: '已上架', unpublished: '已下架' }[s] ?? s
  )
}

function statusType(s: string): 'warning' | 'danger' | 'success' | 'info' {
  if (s === 'pending') return 'warning'
  if (s === 'rejected') return 'danger'
  if (s === 'published') return 'success'
  return 'info'
}

function aiLabel(s?: string) {
  return (
    { idle: '未识别', pending: '识别中', ready: '已就绪', failed: '失败' }[s || 'idle'] ??
    '未识别'
  )
}

function aiTagType(s?: string): 'info' | 'warning' | 'success' | 'danger' {
  if (s === 'ready') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'failed') return 'danger'
  return 'info'
}

function onFilterChange() {
  page.value = 1
  load()
}

function onPageSizeChange() {
  page.value = 1
  load()
}

async function loadTaxonomy() {
  try {
    const tax = await adminApi<{ categories: CategoryRow[] }>('/api/admin/wallpapers/taxonomy')
    categories.value = tax.categories
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载分类失败')
  }
}

async function load() {
  loading.value = true
  try {
    const qs = buildQuery({
      page: page.value,
      pageSize: pageSize.value,
      q: filters.q.trim(),
      status: filters.status,
      category: filters.category,
      aiStatus: filters.aiStatus,
    })
    const data = await adminApi<{
      wallpapers: WallpaperRow[]
      total: number
      page: number
      pageSize: number
    }>(`/api/admin/wallpapers${qs}`)
    rows.value = data.wallpapers
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function setStatus(row: WallpaperRow, status: string) {
  try {
    await adminApi(`/api/admin/wallpapers/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    ElMessage.success('已更新')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '操作失败')
  }
}

async function resubmit(row: WallpaperRow) {
  try {
    await adminApi(`/api/admin/wallpapers/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    })
    ElMessage.success('已回到待审核')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '操作失败')
  }
}

async function reject(row: WallpaperRow) {
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回理由', '驳回壁纸', {
      inputValue: '信息不完整',
    })
    await adminApi(`/api/admin/wallpapers/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', rejectReason: value }),
    })
    ElMessage.success('已驳回')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '操作失败')
  }
}

async function remove(row: WallpaperRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？`, '删除壁纸')
    await adminApi(`/api/admin/wallpapers/${row.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '删除失败')
  }
}

async function batch(action: 'approve' | 'unpublish' | 'delete') {
  const labels = { approve: '审核通过', unpublish: '下架', delete: '删除' }
  try {
    await ElMessageBox.confirm(
      `对已选 ${selected.value.length} 项执行「${labels[action]}」？`,
      '批量操作',
    )
    const data = await adminApi<{ successCount: number; failCount: number }>(
      '/api/admin/wallpapers/batch',
      {
        method: 'POST',
        body: JSON.stringify({
          action,
          ids: selected.value.map((r) => r.id),
        }),
      },
    )
    ElMessage.success(`成功 ${data.successCount}，失败 ${data.failCount}`)
    selected.value = []
    await load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '批量操作失败')
  }
}

const categoryDialogVisible = ref(false)
const categoryPick = ref<string | null>(null)

function batchSetCategory() {
  categoryPick.value = categories.value[0]?.id ?? null
  categoryDialogVisible.value = true
}

async function confirmSetCategory() {
  try {
    const data = await adminApi<{ successCount: number; failCount: number }>(
      '/api/admin/wallpapers/batch',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'set_category',
          ids: selected.value.map((r) => r.id),
          categoryId: categoryPick.value,
        }),
      },
    )
    ElMessage.success(`成功 ${data.successCount}，失败 ${data.failCount}`)
    categoryDialogVisible.value = false
    selected.value = []
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '批量改分类失败')
  }
}

function openReupload(row: WallpaperRow) {
  reuploadId.value = row.id
  reuploadFile.value = null
  reuploadVisible.value = true
}

function onReuploadPick(e: Event) {
  const input = e.target as HTMLInputElement
  reuploadFile.value = input.files?.[0] ?? null
}

async function submitReupload() {
  if (!reuploadFile.value) return
  reuploading.value = true
  try {
    await adminUpload(
      `/api/admin/wallpapers/${reuploadId.value}/original`,
      reuploadFile.value,
    )
    ElMessage.success('原图已上传')
    reuploadVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '上传失败')
  } finally {
    reuploading.value = false
  }
}

onMounted(async () => {
  await loadTaxonomy()
  await load()
})

watch(
  () => [route.query.status, route.query.aiStatus] as const,
  ([status, aiStatus]) => {
    let changed = false
    if (typeof status === 'string' && status !== filters.status) {
      filters.status = status
      changed = true
    }
    if (typeof aiStatus === 'string' && aiStatus !== filters.aiStatus) {
      filters.aiStatus = aiStatus
      changed = true
    }
    if (changed) {
      page.value = 1
      void load()
    }
  },
)
</script>

<style scoped>
.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
.table-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
