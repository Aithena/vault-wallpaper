<template>
  <div class="page-stack">
    <div class="page-panel" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>会员档位与价目</h1>
          <p class="sub">C 端价目与下载权限的唯一配置源。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('settings.tiers.save')"
            type="primary"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </div>
      <el-table :data="rows" stripe border>
        <el-table-column prop="id" label="档位 ID" width="100" />
        <el-table-column label="名称" width="140">
          <template #default="{ row }">
            <el-input v-model="row.label" />
          </template>
        </el-table-column>
        <el-table-column label="价格（元）" width="140">
          <template #default="{ row }">
            <el-input v-model="row.priceYuan" />
          </template>
        </el-table-column>
        <el-table-column label="是否在售" width="120">
          <template #default="{ row }">
            <el-switch v-model="row.onSale" />
          </template>
        </el-table-column>
        <el-table-column label="权益说明" min-width="220">
          <template #default="{ row }">
            <el-input v-model="row.benefit" />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

type TierRow = {
  id: string
  label: string
  priceYuan: string
  onSale: boolean
  benefit: string
}

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const rows = ref<TierRow[]>([])

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{ tiers: TierRow[] }>('/api/admin/settings/tiers')
    rows.value = data.tiers.map((t) => ({ ...t }))
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await adminApi('/api/admin/settings/tiers', {
      method: 'PUT',
      body: JSON.stringify({ tiers: rows.value }),
    })
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
