<template>
  <div class="page-stack">
    <el-card shadow="never">
      <div class="page-toolbar">
        <div>
          <h1>存储 R2 <el-tag type="warning" size="small" effect="plain">占位</el-tag></h1>
          <p class="sub">后续：用量、路径约定 originals/{id}.jpg、异常对象。</p>
        </div>
      </div>
      <EmptyPlaceholder title="R2 存储面板" description="预留桶用量、对象浏览与清理工具入口。" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
</script>
