<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>{{ isNew ? '上传壁纸' : `编辑壁纸 · ${form.id}` }}</h1>
          <p class="sub">入库默认为待审核；原图写入 R2 `originals/{id}.jpg`，预览写入 `previews/{id}.jpg`。</p>
        </div>
        <div class="actions">
          <el-button @click="$router.push('/wallpapers')">返回列表</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>

      <el-form label-width="100px" style="max-width: 720px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="ID" required>
          <el-input v-model="form.id" :disabled="!isNew" placeholder="如 wp-aurora" />
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
        <el-form-item label="预览文件">
          <input type="file" accept="image/*" @change="onPreviewPick" />
          <span v-if="previewFile" class="hint">{{ previewFile.name }}</span>
        </el-form-item>
        <el-form-item label="原图文件" :required="isNew">
          <input type="file" accept="image/jpeg,image/jpg,.jpg,.jpeg" @change="onOriginalPick" />
          <span v-if="originalFile" class="hint">{{ originalFile.name }}</span>
          <span v-else-if="form.hasOriginal" class="hint ok">R2 已有原图</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminApi, adminUpload, ApiError } from '../../lib/api'

type TaxItem = { id: string; name: string }

const route = useRoute()
const router = useRouter()
const isNew = computed(() => route.name === 'wallpapers-new')
const loading = ref(false)
const saving = ref(false)
const categories = ref<TaxItem[]>([])
const tags = ref<TaxItem[]>([])
const originalFile = ref<File | null>(null)
const previewFile = ref<File | null>(null)

const form = reactive({
  id: '',
  title: '',
  tierRequired: 'free',
  categoryId: '' as string | null,
  tagIds: [] as string[],
  width: 3840,
  height: 2160,
  previewUrl: '',
  hasOriginal: false,
})

function onOriginalPick(e: Event) {
  const input = e.target as HTMLInputElement
  originalFile.value = input.files?.[0] ?? null
}

function onPreviewPick(e: Event) {
  const input = e.target as HTMLInputElement
  previewFile.value = input.files?.[0] ?? null
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
      const data = await adminApi<{
        wallpaper: {
          id: string
          title: string
          tierRequired: string
          categoryId: string | null
          tagIds: string[]
          width: number
          height: number
          previewUrl: string
          hasOriginal: boolean
        }
      }>(`/api/admin/wallpapers/${id}`)
      const w = data.wallpaper
      form.id = w.id
      form.title = w.title
      form.tierRequired = w.tierRequired
      form.categoryId = w.categoryId
      form.tagIds = w.tagIds || []
      form.width = w.width
      form.height = w.height
      form.previewUrl = w.previewUrl
      form.hasOriginal = w.hasOriginal
    }
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.id.trim() || !form.title.trim()) {
    ElMessage.warning('请填写 ID 与标题')
    return
  }
  if (isNew.value && !originalFile.value) {
    ElMessage.warning('请选择原图文件（jpg）')
    return
  }
  saving.value = true
  try {
    const id = form.id.trim()
    const payload = {
      id,
      title: form.title,
      tierRequired: form.tierRequired,
      categoryId: form.categoryId || null,
      tagIds: form.tagIds,
      width: form.width,
      height: form.height,
      previewUrl: form.previewUrl,
    }
    if (isNew.value) {
      await adminApi('/api/admin/wallpapers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } else {
      await adminApi(`/api/admin/wallpapers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    }

    if (originalFile.value) {
      await adminUpload(`/api/admin/wallpapers/${id}/original`, originalFile.value)
    }
    if (previewFile.value) {
      const res = await adminUpload<{ previewUrl: string }>(
        `/api/admin/wallpapers/${id}/preview`,
        previewFile.value,
      )
      if (res.previewUrl) form.previewUrl = res.previewUrl
    }

    ElMessage.success(isNew.value ? '已创建，待审核' : '已保存')
    router.push('/wallpapers')
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.hint.ok {
  color: var(--el-color-success);
}
</style>
