<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loadingTax">
      <div class="page-toolbar">
        <div>
          <h1>批量上传壁纸</h1>
          <p class="sub">
            选择多张 jpg 原图；ID 默认取文件名，入库为待审核。开启「同步预览」后会写入
            R2 预览并异步触发 Workers AI（描述 / 建议分类标签），人工审核时确认。
          </p>
        </div>
        <div class="actions">
          <el-button @click="$router.push('/wallpapers')">返回列表</el-button>
          <el-button type="primary" :loading="uploading" :disabled="!rows.length" @click="startUpload">
            开始上传（{{ rows.length }}）
          </el-button>
        </div>
      </div>

      <el-form label-width="100px" style="max-width: 720px; margin-bottom: 18px">
        <el-form-item label="选择文件">
          <input
            type="file"
            accept="image/jpeg,image/jpg,.jpg,.jpeg"
            multiple
            @change="onPick"
          />
        </el-form-item>
        <el-form-item label="默认档位">
          <el-select v-model="defaults.tierRequired" style="width: 100%">
            <el-option label="free" value="free" />
            <el-option label="basic" value="basic" />
            <el-option label="pro" value="pro" />
            <el-option label="max" value="max" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认分类">
          <el-select v-model="defaults.categoryId" clearable style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认标签">
          <el-select v-model="defaults.tagIds" multiple clearable style="width: 100%">
            <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="同步预览">
          <el-switch v-model="defaults.useAsPreview" />
          <span class="hint">开启后把原图同时写入 previews/{id}.jpg</span>
        </el-form-item>
        <el-form-item label="默认尺寸">
          <el-input-number v-model="defaults.width" :min="1" />
          <span style="margin: 0 8px">×</span>
          <el-input-number v-model="defaults.height" :min="1" />
          <span class="hint">若能读取文件尺寸会自动覆盖</span>
        </el-form-item>
      </el-form>

      <el-table :data="rows" stripe border max-height="480">
        <el-table-column label="文件" min-width="160">
          <template #default="{ row }">{{ row.fileName }}</template>
        </el-table-column>
        <el-table-column label="ID" min-width="140">
          <template #default="{ row }">
            <el-input v-model="row.id" size="small" :disabled="row.status === 'done'" />
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="140">
          <template #default="{ row }">
            <el-input v-model="row.title" size="small" :disabled="row.status === 'done'" />
          </template>
        </el-table-column>
        <el-table-column label="尺寸" width="120">
          <template #default="{ row }">{{ row.width }}×{{ row.height }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="
                row.status === 'done'
                  ? 'success'
                  : row.status === 'error'
                    ? 'danger'
                    : row.status === 'uploading'
                      ? 'warning'
                      : 'info'
              "
            >
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="160">
          <template #default="{ row }">{{ row.message || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row, $index }">
            <el-button
              link
              type="danger"
              :disabled="uploading || row.status === 'uploading'"
              @click="rows.splice($index, 1)"
            >
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminApi, adminUpload, ApiError } from '../../lib/api'

type TaxItem = { id: string; name: string }

type RowStatus = 'pending' | 'uploading' | 'done' | 'error'

type UploadRow = {
  file: File
  fileName: string
  id: string
  title: string
  width: number
  height: number
  status: RowStatus
  message: string
}

const router = useRouter()
const loadingTax = ref(false)
const uploading = ref(false)
const categories = ref<TaxItem[]>([])
const tags = ref<TaxItem[]>([])
const rows = ref<UploadRow[]>([])

const defaults = reactive({
  tierRequired: 'free',
  categoryId: '' as string | null,
  tagIds: [] as string[],
  width: 3840,
  height: 2160,
  useAsPreview: true,
})

function statusLabel(s: RowStatus) {
  return (
    {
      pending: '待上传',
      uploading: '上传中',
      done: '完成',
      error: '失败',
    }[s] ?? s
  )
}

function slugFromName(name: string) {
  const base = name.replace(/\.[^.]+$/, '')
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `wp-${Date.now()}`
}

function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/, '') || name
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || defaults.width, height: img.naturalHeight || defaults.height })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).filter((f) =>
    /\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg',
  )
  if (!files.length) {
    ElMessage.warning('请选择 jpg 文件')
    return
  }
  const next: UploadRow[] = []
  for (const file of files) {
    const size = await readImageSize(file)
    next.push({
      file,
      fileName: file.name,
      id: slugFromName(file.name),
      title: titleFromName(file.name),
      width: size?.width || defaults.width,
      height: size?.height || defaults.height,
      status: 'pending',
      message: '',
    })
  }
  // dedupe ids within batch
  const seen = new Set(rows.value.map((r) => r.id))
  for (const row of next) {
    let id = row.id
    let n = 2
    while (seen.has(id)) {
      id = `${row.id}-${n}`
      n += 1
    }
    row.id = id
    seen.add(id)
  }
  rows.value = [...rows.value, ...next]
  input.value = ''
}

async function loadTax() {
  loadingTax.value = true
  try {
    const tax = await adminApi<{ categories: TaxItem[]; tags: TaxItem[] }>(
      '/api/admin/wallpapers/taxonomy',
    )
    categories.value = tax.categories
    tags.value = tax.tags
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载分类失败')
  } finally {
    loadingTax.value = false
  }
}

async function startUpload() {
  if (!rows.value.length) return
  uploading.value = true
  let ok = 0
  let fail = 0
  for (const row of rows.value) {
    if (row.status === 'done') continue
    if (!row.id.trim() || !row.title.trim()) {
      row.status = 'error'
      row.message = 'ID/标题不能为空'
      fail += 1
      continue
    }
    row.status = 'uploading'
    row.message = '创建中…'
    try {
      await adminApi('/api/admin/wallpapers', {
        method: 'POST',
        body: JSON.stringify({
          id: row.id.trim(),
          title: row.title.trim(),
          tierRequired: defaults.tierRequired,
          categoryId: defaults.categoryId || null,
          tagIds: defaults.tagIds,
          width: row.width,
          height: row.height,
          previewUrl: '',
        }),
      })
      row.message = '上传原图…'
      await adminUpload(`/api/admin/wallpapers/${row.id.trim()}/original`, row.file)
      if (defaults.useAsPreview) {
        row.message = '上传预览…'
        await adminUpload(`/api/admin/wallpapers/${row.id.trim()}/preview`, row.file)
      }
      row.status = 'done'
      row.message = defaults.useAsPreview
        ? '已入库（待审核，AI 识别中）'
        : '已入库（待审核；未传预览则需手动识别）'
      ok += 1
    } catch (e) {
      row.status = 'error'
      row.message = e instanceof ApiError ? e.code : '上传失败'
      fail += 1
    }
  }
  uploading.value = false
  ElMessage.success(`完成：成功 ${ok}，失败 ${fail}`)
  if (ok > 0 && fail === 0) {
    router.push('/wallpapers')
  }
}

onMounted(loadTax)
</script>

<style scoped>
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
