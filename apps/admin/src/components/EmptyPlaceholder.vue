<template>
  <el-empty :description="description" />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: '',
    description: '此页面为占位，后续接入真实数据与能力。',
  },
)
</script>
