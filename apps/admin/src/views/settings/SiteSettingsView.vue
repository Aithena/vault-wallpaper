<template>
  <div class="page-stack">
    <el-card shadow="never" v-loading="loading">
      <div class="page-toolbar">
        <div>
          <h1>基础网站配置</h1>
          <p class="sub">站点级文案与开关；售价请到「会员档位与价目」维护。</p>
        </div>
        <div class="actions">
          <el-button
            v-if="hasButton('settings.site.save')"
            type="primary"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </div>
      <el-form label-width="100px" style="max-width: 640px">
        <el-form-item label="站点名称">
          <el-input v-model="form.siteName" />
        </el-form-item>
        <el-form-item label="域名">
          <el-input v-model="form.domain" />
        </el-form-item>
        <el-form-item label="购买须知">
          <el-input v-model="form.purchaseNotice" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="版权信息">
          <el-input v-model="form.copyright" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="开放购买">
          <el-switch v-model="form.purchaseEnabled" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, ApiError } from '../../lib/api'
import { usePermission } from '../../lib/permission'

const { hasButton } = usePermission()
const loading = ref(false)
const saving = ref(false)
const form = reactive({
  siteName: '',
  domain: '',
  purchaseNotice: '',
  copyright: '',
  purchaseEnabled: true,
})

async function load() {
  loading.value = true
  try {
    const data = await adminApi<{
      config: {
        siteName: string
        domain: string
        purchaseNotice: string
        copyright: string
        purchaseEnabled: boolean
      }
    }>('/api/admin/settings/site')
    Object.assign(form, data.config)
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.code : '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await adminApi('/api/admin/settings/site', {
      method: 'PUT',
      body: JSON.stringify({ ...form }),
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
