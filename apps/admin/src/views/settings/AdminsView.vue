<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>员工管理</h1>
          <p class="sub">绑定角色（菜单+按钮）；可覆盖数据权限。用户名登录，邮箱用于重置密码。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('settings.admins.create')"
            type="primary"
            @click="openCreate"
          >
            新增员工
          </el-button>
        </div>
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="nickName" label="昵称" width="120" />
        <el-table-column prop="realName" label="真实姓名" width="120">
          <template #default="{ row }">{{ row.realName || '—' }}</template>
        </el-table-column>
        <el-table-column label="绑定邮箱" min-width="160">
          <template #default="{ row }">{{ row.email || '—' }}</template>
        </el-table-column>
        <el-table-column label="角色" width="140">
          <template #default="{ row }">{{ row.roleName }}</template>
        </el-table-column>
        <el-table-column label="数据权限" width="110">
          <template #default="{ row }">{{ dataScopeLabel(row.dataScope) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ row.createdAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="280">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('settings.admins.edit')"
              link
              type="primary"
              @click="openEdit(row as AdminPublic)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('settings.admins.password')"
              link
              type="primary"
              @click="openPassword(row as AdminPublic)"
            >
              改密码
            </el-button>
            <el-button
              v-if="hasButton('settings.admins.email')"
              link
              type="primary"
              @click="openEmail(row as AdminPublic)"
            >
              绑定邮箱
            </el-button>
            <el-button
              v-if="hasButton('settings.admins.disable')"
              link
              :type="row.status === 'active' ? 'danger' : 'success'"
              :disabled="row.id === me?.id && row.status === 'active'"
              @click="toggleStatus(row as AdminPublic)"
            >
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="createVisible" title="新增员工" width="520px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="用户名" required>
          <el-input v-model="createForm.username" placeholder="小写字母开头" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="createForm.nickName" placeholder="默认用用户名" />
        </el-form-item>
        <el-form-item label="真实姓名">
          <el-input v-model="createForm.realName" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="createForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="绑定邮箱">
          <el-input v-model="createForm.email" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="createForm.roleId" style="width: 100%">
            <el-option
              v-for="r in roleOptions"
              :key="r.id"
              :label="r.name"
              :value="r.id"
              :disabled="r.id === SYSTEM_ROLE_SUPER_ID && me?.roleId !== SYSTEM_ROLE_SUPER_ID"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数据权限">
          <el-select v-model="createForm.dataScope" style="width: 100%">
            <el-option label="跟随角色" value="follow_role" />
            <el-option label="全部数据" value="all" />
            <el-option label="仅个人数据" value="self" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑资料" width="520px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="用户名">
          <el-input v-model="editForm.username" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickName" />
        </el-form-item>
        <el-form-item label="真实姓名">
          <el-input v-model="editForm.realName" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.roleId" style="width: 100%">
            <el-option
              v-for="r in roleOptions"
              :key="r.id"
              :label="r.name"
              :value="r.id"
              :disabled="r.id === SYSTEM_ROLE_SUPER_ID && me?.roleId !== SYSTEM_ROLE_SUPER_ID"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数据权限">
          <el-select v-model="editForm.dataScope" style="width: 100%">
            <el-option label="跟随角色" value="follow_role" />
            <el-option label="全部数据" value="all" />
            <el-option label="仅个人数据" value="self" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="修改密码" width="420px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="用户名">
          <el-input :model-value="passwordForm.username" disabled />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="passwordForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPassword">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="emailVisible" title="绑定邮箱" width="420px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="用户名">
          <el-input :model-value="emailForm.username" disabled />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="emailForm.email" placeholder="用于重置密码，可清空解绑" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="emailVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEmail">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  SYSTEM_ROLE_OPS_ID,
  SYSTEM_ROLE_SUPER_ID,
  type AdminDataScopeOverride,
  type AdminPublic,
  type RolePublic,
} from '@vault/shared'
import { adminApi, ApiError } from '../../lib/api'
import { adminErrorMessage, getAdminProfile, refreshAdminMe } from '../../lib/auth'
import { usePermission } from '../../lib/permission'

const { hasButton } = usePermission()
const rows = ref<AdminPublic[]>([])
const roleOptions = ref<RolePublic[]>([])
const loading = ref(false)
const saving = ref(false)
const me = ref<AdminPublic | null>(getAdminProfile())

const createVisible = ref(false)
const editVisible = ref(false)
const passwordVisible = ref(false)
const emailVisible = ref(false)

const createForm = reactive({
  username: '',
  nickName: '',
  realName: '',
  password: '',
  email: '',
  roleId: SYSTEM_ROLE_OPS_ID,
  dataScope: 'follow_role' as AdminDataScopeOverride,
})

const editForm = reactive({
  id: '',
  username: '',
  nickName: '',
  realName: '',
  roleId: SYSTEM_ROLE_OPS_ID,
  dataScope: 'follow_role' as AdminDataScopeOverride,
})

const passwordForm = reactive({
  id: '',
  username: '',
  password: '',
})

const emailForm = reactive({
  id: '',
  username: '',
  email: '',
})

function dataScopeLabel(scope: AdminDataScopeOverride) {
  if (scope === 'all') return '全部'
  if (scope === 'self') return '仅个人'
  return '跟随角色'
}

async function loadRoles() {
  const data = await adminApi<{ roles: RolePublic[] }>('/api/admin/admins/meta/roles')
  roleOptions.value = data.roles
}

async function load() {
  loading.value = true
  try {
    me.value = (await refreshAdminMe()) ?? getAdminProfile()
    await loadRoles()
    const data = await adminApi<{ admins: AdminPublic[] }>('/api/admin/admins')
    rows.value = data.admins
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    loading.value = false
  }
}

function defaultRoleId() {
  const ops = roleOptions.value.find((r) => r.id === SYSTEM_ROLE_OPS_ID)
  if (ops) return ops.id
  const nonSuper = roleOptions.value.find((r) => r.id !== SYSTEM_ROLE_SUPER_ID)
  return nonSuper?.id || roleOptions.value[0]?.id || ''
}

function openCreate() {
  createForm.username = ''
  createForm.nickName = ''
  createForm.realName = ''
  createForm.password = ''
  createForm.email = ''
  createForm.roleId = defaultRoleId()
  createForm.dataScope = 'follow_role'
  createVisible.value = true
}

function openEdit(row: AdminPublic) {
  editForm.id = row.id
  editForm.username = row.username
  editForm.nickName = row.nickName
  editForm.realName = row.realName || ''
  editForm.roleId = row.roleId
  editForm.dataScope = row.dataScope
  editVisible.value = true
}

function openPassword(row: AdminPublic) {
  passwordForm.id = row.id
  passwordForm.username = row.username
  passwordForm.password = ''
  passwordVisible.value = true
}

function openEmail(row: AdminPublic) {
  emailForm.id = row.id
  emailForm.username = row.username
  emailForm.email = row.email ?? ''
  emailVisible.value = true
}

async function submitCreate() {
  saving.value = true
  try {
    await adminApi('/api/admin/admins', {
      method: 'POST',
      body: JSON.stringify({
        username: createForm.username,
        nickName: createForm.nickName || createForm.username,
        realName: createForm.realName,
        password: createForm.password,
        email: createForm.email || null,
        roleId: createForm.roleId,
        dataScope: createForm.dataScope,
      }),
    })
    ElMessage.success('已创建')
    createVisible.value = false
    await load()
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    saving.value = false
  }
}

async function submitEdit() {
  saving.value = true
  try {
    await adminApi(`/api/admin/admins/${editForm.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickName: editForm.nickName,
        realName: editForm.realName,
        username: editForm.username,
        roleId: editForm.roleId,
        dataScope: editForm.dataScope,
      }),
    })
    ElMessage.success('已保存')
    editVisible.value = false
    await load()
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    saving.value = false
  }
}

async function submitPassword() {
  saving.value = true
  try {
    await adminApi(`/api/admin/admins/${passwordForm.id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password: passwordForm.password }),
    })
    ElMessage.success('密码已更新')
    passwordVisible.value = false
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    saving.value = false
  }
}

async function submitEmail() {
  saving.value = true
  try {
    await adminApi(`/api/admin/admins/${emailForm.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ email: emailForm.email.trim() || null }),
    })
    ElMessage.success('邮箱已更新')
    emailVisible.value = false
    await load()
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: AdminPublic) {
  const next = row.status === 'active' ? 'disabled' : 'active'
  try {
    if (next === 'disabled') {
      await ElMessageBox.confirm(`确认禁用员工「${row.username}」？`, '提示', {
        type: 'warning',
      })
    }
    await adminApi(`/api/admin/admins/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    })
    ElMessage.success(next === 'disabled' ? '已禁用' : '已启用')
    await load()
  } catch (e) {
    if (e === 'cancel') return
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  }
}

onMounted(() => {
  void load()
})
</script>
