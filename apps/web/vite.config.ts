import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  server: {
    port: 18811,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18813',
        changeOrigin: true,
      },
    },
  },
})
