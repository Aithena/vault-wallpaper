<template>
  <div class="page-stack">
    <el-card shadow="never">
      <div class="page-toolbar">
        <div>
          <h1>数据总览 <el-tag type="warning" size="small" effect="plain">占位</el-tag></h1>
          <p class="sub">后续接入用户、订单、待审壁纸、下载等汇总指标。</p>
        </div>
      </div>
      <EmptyPlaceholder
        title="看板预留空白"
        description="图表与核心指标卡片将在有真实数据后补齐，当前仅保留页面骨架。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import EmptyPlaceholder from '../../components/EmptyPlaceholder.vue'
</script>
