<template>
  <div class="page-stack">
    <el-card shadow="never">
      <div class="page-toolbar">
        <div>
          <h1>虎皮椒支付</h1>
          <p class="sub">密钥配置、支付总开关、支付测试、回调日志（静态表单）。</p>
        </div>
        <div class="actions">
          <el-button @click="ElMessage.info('支付测试（静态）')">支付测试</el-button>
          <el-button type="primary" @click="ElMessage.success('保存支付配置（静态）')">
            保存
          </el-button>
        </div>
      </div>

      <el-form label-width="110px" style="max-width: 560px; margin-bottom: 24px">
        <el-form-item label="支付总开关">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="App ID">
          <el-input v-model="form.appId" placeholder="未配置时走 mock" />
        </el-form-item>
        <el-form-item label="App Secret">
          <el-input v-model="form.appSecret" type="password" show-password placeholder="••••••••" />
        </el-form-item>
      </el-form>

      <h3 style="margin: 0 0 12px; font-size: 15px">回调日志（演示）</h3>
      <el-table :data="callbackLogs" stripe border>
        <el-table-column prop="at" label="时间" width="180" />
        <el-table-column prop="orderId" label="订单号" width="140" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'danger'" size="small">
              {{ row.ok ? 'ok' : 'fail' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="200" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

const form = reactive({
  enabled: true,
  appId: '',
  appSecret: '',
})

const callbackLogs = ref([
  {
    at: '2026-08-06 20:01:12',
    orderId: 'ord_1001',
    ok: true,
    summary: 'trade_status=TRADE_SUCCESS',
  },
  {
    at: '2026-08-05 11:22:03',
    orderId: 'ord_0998',
    ok: false,
    summary: 'sign invalid',
  },
])
</script>
