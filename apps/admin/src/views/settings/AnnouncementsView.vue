<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>公告管理</h1>
          <p class="sub">新增、编辑、删除；C 端展示位后续对接。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('settings.announcements.create')"
            type="primary"
            @click="openCreate"
          >
            新增公告
          </el-button>
        </div>
      </div>
      <el-table :data="rows" stripe border>
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
              {{ row.status === 'published' ? '已发布' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('settings.announcements.edit')"
              link
              type="primary"
              @click="openEdit(row as Announcement)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('settings.announcements.delete')"
              link
              type="danger"
              @click="remove(row as Announcement)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      append-to="#awall-overlays"
      v-model="dialogVisible"
      :title="editingId ? '编辑公告' : '新增公告'"
      width="1000px"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="内容">
          <AiEditorField v-model="form.content" placeholder="请输入公告内容..." />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AiEditorField from '../../components/AiEditorField.vue'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type Announcement = {
  id: string
  title: string
  content: string
  status: 'draft' | 'published'
  updatedAt: string
}

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const rows = ref<Announcement[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  title: '',
  content: '',
  status: 'draft' as 'draft' | 'published',
})

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ announcements: Announcement[] }>(
      '/api/admin/settings/announcements',
    )
    rows.value = data.announcements
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.title = ''
  form.content = ''
  form.status = 'draft'
  dialogVisible.value = true
}

function openEdit(row: Announcement) {
  editingId.value = row.id
  form.title = row.title
  form.content = row.content
  form.status = row.status
  dialogVisible.value = true
}

async function submit() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await adminApi(`/api/admin/settings/announcements/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form }),
      })
    } else {
      await adminApi('/api/admin/settings/announcements', {
        method: 'POST',
        body: JSON.stringify({ ...form }),
      })
    }
    dialogVisible.value = false
    ElMessage.success('已保存')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: Announcement) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？`, '删除公告')
    await adminApi(`/api/admin/settings/announcements/${row.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '删除失败')
  }
}

onMounted(load)
</script>
