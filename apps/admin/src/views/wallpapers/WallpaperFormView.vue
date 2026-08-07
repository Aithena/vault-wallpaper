<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>{{ isNew ? '上传壁纸' : `编辑壁纸 · ${form.id}` }}</h1>
          <p class="sub">
            入库默认为待审核。ID 由系统自动生成。上传预览后会异步触发 Workers AI；审核时确认描述、分类与标签后再通过。
          </p>
        </div>
        <div class="actions">
          <el-button @click="$router.push('/wallpapers')">返回列表</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>

      <el-row :gutter="24">
        <el-col :xs="24" :md="14">
          <el-form label-width="100px">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="3"
                placeholder="可来自 AI，审核时可修改"
              />
            </el-form-item>
            <el-form-item v-if="!isNew" label="ID">
              <el-input :model-value="form.id" disabled />
            </el-form-item>
            <el-form-item label="所需档位">
              <el-select v-model="form.tierRequired" style="width: 100%">
                <el-option label="free" value="free" />
                <el-option label="basic" value="basic" />
                <el-option label="pro" value="pro" />
                <el-option label="max" value="max" />
              </el-select>
            </el-form-item>
            <el-form-item label="分类">
              <el-select v-model="form.categoryId" clearable style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="标签">
              <el-select v-model="form.tagIds" multiple clearable style="width: 100%">
                <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="宽度">
              <el-input-number v-model="form.width" :min="1" />
            </el-form-item>
            <el-form-item label="高度">
              <el-input-number v-model="form.height" :min="1" />
            </el-form-item>
            <el-form-item label="预览图 URL">
              <el-input v-model="form.previewUrl" placeholder="可手填外链，或下方上传到 R2" />
            </el-form-item>
            <el-form-item label="原图文件" :required="isNew">
              <div class="pickers">
                <el-upload
                  accept="image/jpeg,image/jpg,.jpg,.jpeg"
                  :auto-upload="false"
                  :show-file-list="false"
                  :disabled="saving"
                  :on-change="onOriginalChange"
                >
                  <div v-if="originalLocalUrl" class="thumb-card">
                    <img
                      :src="originalLocalUrl"
                      alt="original"
                      class="thumb"
                      :class="{ blurred: Boolean(originalFile) }"
                    />
                    <span v-if="originalFile" class="thumb-mask">待上传</span>
                  </div>
                  <div v-else class="thumb-card empty">
                    <el-icon :size="22"><Plus /></el-icon>
                    <span>{{ form.hasOriginal ? '更换原图' : '选择原图' }}</span>
                  </div>
                </el-upload>
                <div class="picker-side">
                  <span v-if="form.hasOriginal && !originalFile" class="hint ok">R2 已有原图</span>
                  <span v-else-if="originalFile" class="hint">{{ originalFile.name }}</span>
                  <el-button
                    v-if="originalFile"
                    link
                    type="danger"
                    :disabled="saving"
                    @click="clearOriginal"
                  >
                    清除
                  </el-button>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="预览文件">
              <div class="pickers">
                <el-upload
                  accept="image/*"
                  :auto-upload="false"
                  :show-file-list="false"
                  :disabled="saving"
                  :on-change="onPreviewChange"
                >
                  <div v-if="previewLocalUrl" class="thumb-card">
                    <img
                      :src="previewLocalUrl"
                      alt="preview"
                      class="thumb"
                      :class="{ blurred: Boolean(previewFile) }"
                    />
                    <span v-if="previewFile" class="thumb-mask">待上传</span>
                  </div>
                  <div v-else class="thumb-card empty">
                    <el-icon :size="22"><Plus /></el-icon>
                    <span>选择预览</span>
                  </div>
                </el-upload>
                <el-button
                  v-if="previewFile"
                  link
                  type="danger"
                  :disabled="saving"
                  @click="clearPreview"
                >
                  清除
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-col>

        <el-col v-if="!isNew" :xs="24" :md="10">
          <div class="ai-panel">
            <div class="ai-panel-head">
              <h3>AI 识别建议</h3>
              <el-tag :type="aiTagType" size="small">{{ aiStatusLabel }}</el-tag>
            </div>
            <p v-if="form.aiError" class="ai-error">失败：{{ form.aiError }}</p>
            <p v-if="form.aiAnalyzedAt" class="hint">识别于 {{ formatTime(form.aiAnalyzedAt) }}</p>

            <div class="ai-block">
              <div class="ai-label">建议标题</div>
              <div class="ai-text">{{ form.aiSuggestedTitle || '—' }}</div>
            </div>
            <div class="ai-block">
              <div class="ai-label">图片描述</div>
              <div class="ai-text">{{ form.aiDescription || '—' }}</div>
            </div>
            <div class="ai-block">
              <div class="ai-label">建议分类</div>
              <div class="ai-text">{{ categoryName(form.aiSuggestedCategoryId) || '—' }}</div>
            </div>
            <div class="ai-block">
              <div class="ai-label">建议标签</div>
              <div class="ai-text">{{ tagNames(form.aiSuggestedTagIds) || '—' }}</div>
            </div>

            <div class="ai-actions">
              <el-button
                v-if="hasButton('wallpapers.list.edit')"
                type="primary"
                :disabled="form.aiStatus !== 'ready'"
                @click="applyAi"
              >
                采用 AI 建议
              </el-button>
              <el-button
                v-if="hasButton('wallpapers.list.ai')"
                type="danger"
                :loading="aiRunning"
                @click="runAi"
              >
                重新识别
              </el-button>
            </div>
            <p class="hint">采用后写入左侧表单字段，仍需点「保存」入库；通过审核前可再改。</p>
          </div>

          <div v-if="form.previewUrl" class="preview-box">
            <img :src="form.previewUrl" alt="preview" />
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { adminApi, adminUpload, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type TaxItem = { id: string; name: string }
type AiStatus = 'idle' | 'pending' | 'ready' | 'failed'

type WallpaperDetail = {
  id: string
  title: string
  description?: string
  tierRequired: string
  categoryId: string | null
  tagIds: string[]
  width: number
  height: number
  previewUrl: string
  hasOriginal: boolean
  aiStatus?: AiStatus
  aiDescription?: string
  aiSuggestedTitle?: string
  aiSuggestedCategoryId?: string | null
  aiSuggestedTagIds?: string[]
  aiError?: string | null
  aiAnalyzedAt?: string | null
}

const { hasButton } = usePermission()
const route = useRoute()
const router = useRouter()
const isNew = computed(() => route.name === 'wallpapers-new')
const loading = ref(false)
const saving = ref(false)
const aiRunning = ref(false)
const categories = ref<TaxItem[]>([])
const tags = ref<TaxItem[]>([])
const originalFile = ref<File | null>(null)
const previewFile = ref<File | null>(null)
const originalLocalUrl = ref('')
const previewLocalUrl = ref('')

const form = reactive({
  id: '',
  title: '',
  description: '',
  tierRequired: 'free',
  categoryId: '' as string | null,
  tagIds: [] as string[],
  width: 3840,
  height: 2160,
  previewUrl: '',
  hasOriginal: false,
  aiStatus: 'idle' as AiStatus,
  aiDescription: '',
  aiSuggestedTitle: '',
  aiSuggestedCategoryId: null as string | null,
  aiSuggestedTagIds: [] as string[],
  aiError: '' as string,
  aiAnalyzedAt: '' as string,
})

const aiStatusLabel = computed(
  () =>
    (
      {
        idle: '未识别',
        pending: '识别中',
        ready: '已就绪',
        failed: '失败',
      } as const
    )[form.aiStatus],
)

const aiTagType = computed(() => {
  if (form.aiStatus === 'ready') return 'success' as const
  if (form.aiStatus === 'pending') return 'warning' as const
  if (form.aiStatus === 'failed') return 'danger' as const
  return 'info' as const
})

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

function categoryName(id: string | null | undefined) {
  if (!id) return ''
  return categories.value.find((c) => c.id === id)?.name || id
}

function tagNames(ids: string[] | undefined) {
  if (!ids?.length) return ''
  return ids
    .map((id) => tags.value.find((t) => t.id === id)?.name || id)
    .join('、')
}

function revokeUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function setOriginal(file: File | null) {
  if (originalLocalUrl.value) revokeUrl(originalLocalUrl.value)
  originalFile.value = file
  originalLocalUrl.value = file ? URL.createObjectURL(file) : ''
}

function setPreview(file: File | null) {
  if (previewLocalUrl.value) revokeUrl(previewLocalUrl.value)
  previewFile.value = file
  previewLocalUrl.value = file ? URL.createObjectURL(file) : ''
}

function clearOriginal() {
  setOriginal(null)
}

function clearPreview() {
  setPreview(null)
}

function onOriginalChange(uploadFile: UploadFile) {
  const raw = uploadFile.raw
  if (!raw) return
  if (!/\.jpe?g$/i.test(raw.name) && raw.type !== 'image/jpeg') {
    ElMessage.warning('原图请选择 jpg')
    return
  }
  setOriginal(raw)
}

function onPreviewChange(uploadFile: UploadFile) {
  const raw = uploadFile.raw
  if (!raw) return
  setPreview(raw)
}

function applyWallpaper(w: WallpaperDetail) {
  form.id = w.id
  form.title = w.title
  form.description = w.description || ''
  form.tierRequired = w.tierRequired
  form.categoryId = w.categoryId
  form.tagIds = w.tagIds || []
  form.width = w.width
  form.height = w.height
  form.previewUrl = w.previewUrl
  form.hasOriginal = w.hasOriginal
  form.aiStatus = w.aiStatus || 'idle'
  form.aiDescription = w.aiDescription || ''
  form.aiSuggestedTitle = w.aiSuggestedTitle || ''
  form.aiSuggestedCategoryId = w.aiSuggestedCategoryId ?? null
  form.aiSuggestedTagIds = w.aiSuggestedTagIds || []
  form.aiError = w.aiError || ''
  form.aiAnalyzedAt = w.aiAnalyzedAt || ''
  if (!previewFile.value && w.previewUrl) {
    if (previewLocalUrl.value) revokeUrl(previewLocalUrl.value)
    previewLocalUrl.value = w.previewUrl
  }
}

async function load() {
  loading.value = true
  try {
    const tax = await adminApi<{ categories: TaxItem[]; tags: TaxItem[] }>(
      '/api/admin/wallpapers/taxonomy',
    )
    categories.value = tax.categories
    tags.value = tax.tags

    if (!isNew.value) {
      const id = String(route.params.id)
      const data = await adminApi<{ wallpaper: WallpaperDetail }>(
        `/api/admin/wallpapers/${id}`,
      )
      applyWallpaper(data.wallpaper)
    }
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function runAi() {
  if (!form.id) return
  aiRunning.value = true
  form.aiStatus = 'pending'
  try {
    const data = await adminApi<{ wallpaper: WallpaperDetail }>(
      `/api/admin/wallpapers/${form.id}/ai-analyze`,
      { method: 'POST' },
    )
    applyWallpaper(data.wallpaper)
    ElMessage.success('识别完成')
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '识别失败')
    await load()
  } finally {
    aiRunning.value = false
  }
}

function applyAi() {
  if (form.aiSuggestedTitle) form.title = form.aiSuggestedTitle
  if (form.aiDescription) form.description = form.aiDescription
  if (form.aiSuggestedCategoryId) form.categoryId = form.aiSuggestedCategoryId
  if (form.aiSuggestedTagIds.length) form.tagIds = [...form.aiSuggestedTagIds]
  ElMessage.success('已填入左侧表单，请确认后保存')
}

async function save() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  if (isNew.value && !originalFile.value) {
    ElMessage.warning('请选择原图文件（jpg）')
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title,
      description: form.description,
      tierRequired: form.tierRequired,
      categoryId: form.categoryId || null,
      tagIds: form.tagIds,
      width: form.width,
      height: form.height,
      previewUrl: form.previewUrl,
    }
    let id = form.id.trim()
    if (isNew.value) {
      const created = await adminApi<{ wallpaper: WallpaperDetail }>(
        '/api/admin/wallpapers',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )
      id = created.wallpaper.id
      form.id = id
    } else {
      await adminApi(`/api/admin/wallpapers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    }

    if (originalFile.value) {
      await adminUpload(`/api/admin/wallpapers/${id}/original`, originalFile.value)
    }
    const previewToUpload = previewFile.value || originalFile.value
    if (previewToUpload) {
      const res = await adminUpload<{ previewUrl: string }>(
        `/api/admin/wallpapers/${id}/preview`,
        previewToUpload,
      )
      if (res.previewUrl) form.previewUrl = res.previewUrl
    }

    ElMessage.success(
      isNew.value
        ? '已创建，待审核（已写入预览，AI 识别中）'
        : '已保存',
    )
    router.push('/wallpapers')
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)

onBeforeUnmount(() => {
  if (originalLocalUrl.value) revokeUrl(originalLocalUrl.value)
  if (previewLocalUrl.value) revokeUrl(previewLocalUrl.value)
})
</script>

<style scoped>
.hint {
  margin-left: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.hint.ok {
  color: var(--el-color-success);
}
.pickers {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}
.pickers :deep(.el-upload) {
  display: inline-flex;
  justify-content: flex-start;
  width: fit-content;
  max-width: 100%;
}
.picker-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
}
.thumb-card {
  position: relative;
  width: min(280px, 100%);
  max-width: 100%;
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  cursor: pointer;
  line-height: 0;
  margin: 0;
}
.thumb-card.empty {
  width: 148px;
  height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.2;
}
.thumb-card.empty:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.thumb {
  width: 100%;
  height: auto;
  display: block;
  vertical-align: top;
  transition: filter 0.35s ease;
}
.thumb.blurred {
  filter: blur(12px) saturate(1.05);
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
  line-height: 1.2;
}
.ai-panel {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  margin-bottom: 16px;
}
.ai-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ai-panel-head h3 {
  margin: 0;
  font-size: 15px;
}
.ai-block {
  margin-bottom: 10px;
}
.ai-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.ai-text {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-error {
  color: var(--el-color-danger);
  font-size: 13px;
  margin: 0 0 8px;
}
.ai-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 8px;
}
.preview-box {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  line-height: 0;
}
.preview-box img {
  display: block;
  width: 100%;
  height: auto;
}
</style>
