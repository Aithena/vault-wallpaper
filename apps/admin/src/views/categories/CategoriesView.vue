<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>分类管理</h1>
          <p class="sub">供 C 端筛选；删除前需处理壁纸引用。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('wallpapers.categories.create')"
            type="primary"
            @click="openCreate"
          >
            新增分类
          </el-button>
        </div>
      </div>
      <el-table :data="rows" stripe border>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="slug" label="标识" />
        <el-table-column prop="wallpaperCount" label="壁纸数" width="100" />
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('wallpapers.categories.edit')"
              link
              type="primary"
              @click="openEdit(row as CategoryRow)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('wallpapers.categories.delete')"
              link
              type="danger"
              @click="remove(row as CategoryRow)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog append-to-body v-model="visible" :title="editingId ? '编辑分类' : '新增分类'" width="480px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="标识" required>
          <el-input v-model="form.slug" placeholder="英文 slug" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
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

type CategoryRow = {
  id: string
  name: string
  slug: string
  sort: number
  wallpaperCount: number
  updatedAt: string
}

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const rows = ref<CategoryRow[]>([])
const visible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', slug: '', sort: 99 })

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ categories: CategoryRow[] }>('/api/admin/wallpapers/categories')
    rows.value = data.categories
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
  form.sort = 99
  visible.value = true
}

function openEdit(row: CategoryRow) {
  editingId.value = row.id
  form.name = row.name
  form.slug = row.slug
  form.sort = row.sort
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
      await adminApi(`/api/admin/wallpapers/categories/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form }),
      })
    } else {
      await adminApi('/api/admin/wallpapers/categories', {
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

async function remove(row: CategoryRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.name}」？`, '删除分类')
    await adminApi(`/api/admin/wallpapers/categories/${row.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    const code = e instanceof ApiError ? e.code : '删除失败'
    ElMessage.error(code === 'category_in_use' ? '仍有壁纸引用，无法删除' : code)
  }
}

onMounted(load)
</script>
