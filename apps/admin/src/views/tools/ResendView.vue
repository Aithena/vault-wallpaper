<template>
  <div class="page-stack">
    <el-card shadow="never">
      <div class="page-toolbar">
        <div>
          <h1>Resend 邮件 <el-tag type="warning" size="small" effect="plain">占位</el-tag></h1>
          <p class="sub">后续：发信配置、测试发送与投递状态。</p>
        </div>
      </div>
      <EmptyPlaceholder
        title="邮件配置预留"
        description="预留 Resend API Key、发件域名与测试发送能力。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
</script>
