<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loadingTax">
      <div class="page-toolbar">
        <div>
          <h1>批量上传壁纸</h1>
          <p class="sub">
            选择多张 jpg 原图；ID 由系统自动生成，入库为待审核。开启「同步预览」后会写入
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
          <el-upload
            multiple
            accept="image/jpeg,image/jpg,.jpg,.jpeg"
            :auto-upload="false"
            :show-file-list="false"
            :disabled="uploading"
            :on-change="onUploadChange"
          >
            <el-button type="primary" :disabled="uploading">
              <el-icon class="btn-icon"><Upload /></el-icon>
              选择 jpg 图片
            </el-button>
            <template #tip>
              <div class="el-upload__tip">仅支持 jpg / jpeg，可多选</div>
            </template>
          </el-upload>
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

      <div v-if="rows.length" class="batch-grid">
        <div v-for="(row, index) in rows" :key="row.key" class="batch-card">
          <div class="thumb-wrap">
            <img
              :src="row.previewUrl"
              :alt="row.fileName"
              class="thumb"
              :class="{ blurred: row.status === 'pending' || row.status === 'uploading' }"
            />
            <div v-if="row.status === 'pending'" class="thumb-mask">待上传</div>
            <div v-else-if="row.status === 'uploading'" class="thumb-mask">上传中…</div>
            <el-tag
              class="status-tag"
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
          </div>
          <el-input
            v-model="row.title"
            size="small"
            :disabled="row.status === 'done' || uploading"
            placeholder="标题"
          />
          <div class="meta">
            <span>{{ row.width }}×{{ row.height }}</span>
            <span class="file">{{ row.fileName }}</span>
          </div>
          <div class="meta id-line">{{ row.id || 'ID 上传后生成' }}</div>
          <p v-if="row.message" class="msg">{{ row.message }}</p>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="uploading || row.status === 'uploading'"
            @click="removeRow(index)"
          >
            移除
          </el-button>
        </div>
      </div>
      <el-empty v-else description="尚未选择图片" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import type { UploadFile, UploadFiles } from 'element-plus'
import { adminApi, adminUpload, ApiError } from '../../lib/api'

type TaxItem = { id: string; name: string }

type RowStatus = 'pending' | 'uploading' | 'done' | 'error'

type UploadRow = {
  key: string
  file: File
  fileName: string
  previewUrl: string
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
const seenFiles = new WeakSet<File>()

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

function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/, '') || name
}

function isJpeg(file: File) {
  return /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg'
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({
        width: img.naturalWidth || defaults.width,
        height: img.naturalHeight || defaults.height,
      })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

async function appendFiles(files: File[]) {
  const jpgs = files.filter(isJpeg)
  if (!jpgs.length) {
    ElMessage.warning('请选择 jpg 文件')
    return
  }
  const next: UploadRow[] = []
  for (const file of jpgs) {
    if (seenFiles.has(file)) continue
    seenFiles.add(file)
    const size = await readImageSize(file)
    next.push({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      id: '',
      title: titleFromName(file.name),
      width: size?.width || defaults.width,
      height: size?.height || defaults.height,
      status: 'pending',
      message: '',
    })
  }
  if (next.length) rows.value = [...rows.value, ...next]
}

function onUploadChange(uploadFile: UploadFile, _fileList: UploadFiles) {
  const raw = uploadFile.raw
  if (!raw) return
  void appendFiles([raw])
}

function removeRow(index: number) {
  const row = rows.value[index]
  if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl)
  rows.value.splice(index, 1)
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
    if (!row.title.trim()) {
      row.status = 'error'
      row.message = '标题不能为空'
      fail += 1
      continue
    }
    row.status = 'uploading'
    row.message = '创建中…'
    try {
      const created = await adminApi<{ wallpaper: { id: string } }>(
        '/api/admin/wallpapers',
        {
          method: 'POST',
          body: JSON.stringify({
            title: row.title.trim(),
            tierRequired: defaults.tierRequired,
            categoryId: defaults.categoryId || null,
            tagIds: defaults.tagIds,
            width: row.width,
            height: row.height,
            previewUrl: '',
          }),
        },
      )
      const id = created.wallpaper.id
      row.id = id
      row.message = '上传原图…'
      await adminUpload(`/api/admin/wallpapers/${id}/original`, row.file)
      if (defaults.useAsPreview) {
        row.message = '上传预览…'
        await adminUpload(`/api/admin/wallpapers/${id}/preview`, row.file)
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

onBeforeUnmount(() => {
  for (const row of rows.value) {
    if (row.previewUrl) URL.revokeObjectURL(row.previewUrl)
  }
})
</script>

<style scoped>
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.btn-icon {
  margin-right: 6px;
}
.batch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.batch-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 10px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.thumb-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  line-height: 0;
}
.thumb {
  width: 100%;
  height: auto;
  display: block;
  transition: filter 0.35s ease;
}
.thumb.blurred {
  filter: blur(14px) saturate(1.05);
}
.thumb-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.status-tag {
  position: absolute;
  top: 8px;
  right: 8px;
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.meta .file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.id-line {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.msg {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
  min-height: 1.4em;
}
</style>
