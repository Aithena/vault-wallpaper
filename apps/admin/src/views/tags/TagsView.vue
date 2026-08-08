<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>标签管理</h1>
          <p class="sub">供 C 端筛选；支持壁纸多选标签。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('wallpapers.tags.create')"
            type="primary"
            @click="openCreate"
          >
            新增标签
          </el-button>
        </div>
      </div>
      <el-table :data="rows" stripe border>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="slug" label="标识" />
        <el-table-column prop="wallpaperCount" label="引用数" width="100" />
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('wallpapers.tags.edit')"
              link
              type="primary"
              @click="openEdit(row as TagRow)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.tags.delete')"
              link
              type="danger"
              @click="remove(row as TagRow)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="visible" :title="editingId ? '编辑标签' : '新增标签'" width="480px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="标识" required>
          <el-input v-model="form.slug" placeholder="英文 slug" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type TagRow = {
  id: string
  name: string
  slug: string
  wallpaperCount: number
  updatedAt: string
}

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const rows = ref<TagRow[]>([])
const visible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', slug: '' })

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ tags: TagRow[] }>('/api/admin/wallpapers/tags')
    rows.value = data.tags
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.slug = ''
  visible.value = true
}

function openEdit(row: TagRow) {
  editingId.value = row.id
  form.name = row.name
  form.slug = row.slug
  visible.value = true
}

async function submit() {
  if (!form.name.trim() || !form.slug.trim()) {
    ElMessage.warning('请填写名称与标识')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminApi(`/api/admin/wallpapers/tags/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form }),
      })
    } else {
      await adminApi('/api/admin/wallpapers/tags', {
        method: 'POST',
        body: JSON.stringify({ ...form }),
      })
    }
    visible.value = false
    ElMessage.success('已保存')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: TagRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」？`, '删除标签')
    await adminApi(`/api/admin/wallpapers/tags/${row.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    const code = e instanceof ApiError ? e.code : '删除失败'
    ElMessage.error(code === 'tag_in_use' ? '仍有壁纸引用，无法删除' : code)
  }
}

onMounted(load)
</script>
