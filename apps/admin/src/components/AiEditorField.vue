<template>
  <div ref="elRef" class="ai-editor-field" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { AiEditor } from 'aieditor'
import 'aieditor/dist/style.css'
import { apiUrl, getAdminToken } from '../lib/api'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    height?: string
  }>(),
  {
    modelValue: '',
    placeholder: '点击输入内容...',
    height: '360px',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const elRef = ref<HTMLElement | null>(null)
let editor: AiEditor | null = null
let syncingFromProp = false

onMounted(() => {
  if (!elRef.value) return
  elRef.value.style.height = props.height
  const token = getAdminToken() || ''
  editor = new AiEditor({
    element: elRef.value,
    placeholder: props.placeholder,
    content: props.modelValue || '',
    contentRetention: false,
    lang: 'zh',
    ai: {
      models: {
        openai: {
          // Worker proxies to DeepSeek; Bearer is admin JWT (not the LLM key).
          customUrl: () => apiUrl('/api/admin/ai/v1/chat/completions'),
          apiKey: token,
          model: 'deepseek-v4-flash',
        },
      },
    },
    onChange: (instance) => {
      if (syncingFromProp) return
      emit('update:modelValue', instance.getHtml())
    },
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor) return
    const next = value || ''
    if (next === editor.getHtml()) return
    syncingFromProp = true
    editor.setContent(next)
    syncingFromProp = false
  },
)

onUnmounted(() => {
  editor?.destroy()
  editor = null
})
</script>

<style scoped>
.ai-editor-field {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}
</style>
