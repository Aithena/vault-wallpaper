<template>
  <div class="page-stack">
    <div class="page-panel">
      <div class="page-toolbar">
        <div>
          <h1>Cloudflare <el-tag type="warning" size="small" effect="plain">占位</el-tag></h1>
          <p class="sub">后续：一键清理 CDN 缓存等运维能力。</p>
        </div>
      </div>
      <EmptyPlaceholder
        title="Cloudflare 运维面板"
        description="预留清理 CDN 缓存、域名与 Pages 状态查看等入口。"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
</script>
