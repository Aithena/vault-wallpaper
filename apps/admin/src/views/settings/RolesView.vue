<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>角色管理</h1>
          <p class="sub">配置菜单权限、页面按钮权限与默认数据权限。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('settings.roles.create')"
            type="primary"
            @click="openCreate"
          >
            新增角色
          </el-button>
        </div>
      </div>

      <el-table :data="rows" stripe border>
        <el-table-column prop="name" label="名称" width="140" />
        <el-table-column prop="code" label="标识" width="120" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="数据权限" width="100">
          <template #default="{ row }">
            {{ row.dataScope === 'self' ? '仅个人' : '全部' }}
          </template>
        </el-table-column>
        <el-table-column label="系统" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.system" size="small" type="warning">内置</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="员工数" width="100" prop="adminCount" />
        <el-table-column label="更新时间" min-width="160">
          <template #default="{ row }">{{ row.updatedAt.replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="160">
          <template #default="{ row }">
            <el-button
              v-if="hasButton('settings.roles.edit')"
              link
              type="primary"
              @click="openEdit(row as RolePublic)"
            >
              编辑
            </el-button>
            <el-button
              v-if="hasButton('settings.roles.delete') && !row.system"
              link
              type="danger"
              @click="onDelete(row as RolePublic)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑角色' : '新增角色'"
      width="720px"
      destroy-on-close
      top="5vh"
    >
      <el-form label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="标识" required>
          <el-input
            v-model="form.code"
            :disabled="Boolean(editingId)"
            placeholder="小写字母开头，如 editor"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="默认数据权限">
          <el-radio-group v-model="form.dataScope" :disabled="isSuperEdit">
            <el-radio value="all">全部数据</el-radio>
            <el-radio value="self">仅个人数据</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="菜单 / 按钮">
          <div class="perm-tree">
            <el-tree
              ref="treeRef"
              :data="treeData"
              node-key="key"
              show-checkbox
              default-expand-all
              :props="{ label: 'label', children: 'children' }"
              :default-checked-keys="checkedKeys"
            />
            <p v-if="isSuperEdit" class="muted tip">超级管理员角色固定拥有全部权限。</p>
          </div>
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
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type ElTree } from 'element-plus'
import {
  ADMIN_PERMISSION_TREE,
  SYSTEM_ROLE_SUPER_ID,
  type DataScope,
  type PermissionGroup,
  type RolePublic,
} from '@vault/shared'
import { adminApi, ApiError } from '../../lib/api'
import { adminErrorMessage } from '../../lib/auth'
import { usePermission } from '../../lib/permission'

type TreeNode = { key: string; label: string; children?: TreeNode[] }

const { hasButton } = usePermission()
const rows = ref<RolePublic[]>([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const treeRef = ref<InstanceType<typeof ElTree>>()
const checkedKeys = ref<string[]>([])

const form = reactive({
  name: '',
  code: '',
  remark: '',
  dataScope: 'all' as DataScope,
})

const isSuperEdit = computed(() => editingId.value === SYSTEM_ROLE_SUPER_ID)

const treeData = computed<TreeNode[]>(() =>
  ADMIN_PERMISSION_TREE.map((g: PermissionGroup) => ({
    key: `group:${g.key}`,
    label: g.label,
    children: g.menus.map((m) => ({
      key: m.key,
      label: m.label,
      children: m.buttons.map((b) => ({
        key: b.key,
        label: b.label,
      })),
    })),
  })),
)

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ roles: RolePublic[] }>('/api/admin/roles')
    rows.value = data.roles
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.code = ''
  form.remark = ''
  form.dataScope = 'all'
  checkedKeys.value = []
  dialogVisible.value = true
  void nextTick(() => treeRef.value?.setCheckedKeys([]))
}

function openEdit(row: RolePublic) {
  editingId.value = row.id
  form.name = row.name
  form.code = row.code
  form.remark = row.remark
  form.dataScope = row.dataScope
  checkedKeys.value = [...row.menus, ...row.buttons]
  dialogVisible.value = true
  void nextTick(() => treeRef.value?.setCheckedKeys(checkedKeys.value))
}

function collectChecked(): { menus: string[]; buttons: string[] } {
  const keys = (treeRef.value?.getCheckedKeys(false) as string[]) ?? []
  const half = (treeRef.value?.getHalfCheckedKeys() as string[]) ?? []
  const all = new Set([...keys, ...half])
  const menuSet = new Set(
    ADMIN_PERMISSION_TREE.flatMap((g) => g.menus.map((m) => m.key)),
  )
  const buttonSet = new Set(
    ADMIN_PERMISSION_TREE.flatMap((g) => g.menus.flatMap((m) => m.buttons.map((b) => b.key))),
  )
  const menus = [...all].filter((k) => menuSet.has(k))
  const buttons = [...all].filter((k) => buttonSet.has(k))
  return { menus, buttons }
}

async function submit() {
  saving.value = true
  try {
    const { menus, buttons } = collectChecked()
    if (editingId.value) {
      await adminApi(`/api/admin/roles/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          remark: form.remark,
          menus,
          buttons,
          dataScope: form.dataScope,
        }),
      })
      ElMessage.success('已保存')
    } else {
      await adminApi('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          remark: form.remark,
          menus,
          buttons,
          dataScope: form.dataScope,
        }),
      })
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'request_failed'
    ElMessage.error(adminErrorMessage(code))
  } finally {
    saving.value = false
  }
}

async function onDelete(row: RolePublic) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '提示', { type: 'warning' })
    await adminApi(`/api/admin/roles/${row.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
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

<style scoped lang="less">
.perm-tree {
  width: 100%;
  max-height: 360px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px 12px;
}

.tip {
  margin: 8px 0 0;
  font-size: 12px;
}
</style>
