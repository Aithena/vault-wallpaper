<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>黑名单管理</h1>
          <p class="sub">拉黑后禁止购买与下载（仍可登录）；与账号「禁用」相互独立。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('users.blacklist.create')"
            type="primary"
            @click="openCreate"
          >
            新增拉黑
          </el-button>
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <div class="filter-row" style="margin-bottom: 14px">
        <el-input v-model="q" clearable placeholder="搜索邮箱" style="width: 240px" />
      </div>

      <el-table :data="filtered" stripe border>
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="reason" label="原因" min-width="160" />
        <el-table-column prop="operator" label="操作人" width="120" />
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('users.blacklist.remove')"
              link
              type="danger"
              @click="remove(row as BlacklistRow)"
            >
              解除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog append-to="#awall-overlays" v-model="createVisible" title="新增拉黑" width="480px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="邮箱" required>
          <el-input v-model="form.email" placeholder="已注册用户邮箱" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">确认拉黑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type BlacklistRow = {
  userId: string
  email: string
  reason: string
  operator: string
  createdAt: string
}

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const rows = ref<BlacklistRow[]>([])
const q = ref('')
const createVisible = ref(false)
const form = reactive({ email: '', reason: '' })

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  if (!keyword) return rows.value
  return rows.value.filter((r) => r.email.includes(keyword))
})

function formatTime(v: string) {
  return v.replace('T', ' ').slice(0, 19)
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ items: BlacklistRow[] }>('/api/admin/blacklist')
    rows.value = data.items
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.email = ''
  form.reason = ''
  createVisible.value = true
}

async function submitCreate() {
  if (!form.email.trim()) {
    ElMessage.warning('请填写邮箱')
    return
  }
  saving.value = true
  try {
    await adminApi('/api/admin/blacklist', {
      method: 'POST',
      body: JSON.stringify({
        email: form.email.trim(),
        reason: form.reason.trim() || undefined,
      }),
    })
    ElMessage.success('已拉黑')
    createVisible.value = false
    await load()
  } catch (e) {
    const code = e instanceof ApiError ? e.code : '操作失败'
    ElMessage.error(code === 'user_not_found' ? '用户不存在，请先确认已注册' : code)
  } finally {
    saving.value = false
  }
}

async function remove(row: BlacklistRow) {
  try {
    await ElMessageBox.confirm(`解除拉黑「${row.email}」？`, '解除拉黑')
    await adminApi(`/api/admin/blacklist/${row.userId}`, { method: 'DELETE' })
    ElMessage.success('已解除')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e instanceof ApiError ? e.code : '解除失败')
  }
}

onMounted(load)
</script>
