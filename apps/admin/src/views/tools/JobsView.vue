<template>
  <div class="page-stack">
    <el-card shadow="never">
      <div class="page-toolbar">
        <div>
          <h1>定时任务监控 <el-tag type="warning" size="small" effect="plain">占位</el-tag></h1>
          <p class="sub">会员过期检测、壁纸定时上下架等状态查看。</p>
        </div>
      </div>
      <EmptyPlaceholder
        title="任务监控预留"
        description="后续展示任务上次运行时间、成功/失败与下次计划。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
</script>
