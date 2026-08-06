<template>
  <div class="admin">
    <h1>Vault Wallpaper Admin</h1>
    <p>管理端占位：后续在这里上传壁纸元数据与 R2 原图。当前实验用 API 内置种子数据即可。</p>
    <ul>
      <li>价目档位：9.9 / 19.9 / 29.9</li>
      <li>原图路径约定：R2 <code>originals/{id}.jpg</code></li>
      <li>预览图可公开；下载必须走鉴权 API</li>
    </ul>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="less">
:root {
  --bg: #f6f7f9;
  --text: #1b2430;
  --muted: #5b6775;
}
body {
  margin: 0;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text);
}
.admin {
  max-width: 720px;
  margin: 48px auto;
  padding: 0 20px;
  h1 {
    margin-bottom: 8px;
  }
  p,
  li {
    color: var(--muted);
    line-height: 1.6;
  }
  code {
    background: #e8ecf1;
    padding: 2px 6px;
    border-radius: 4px;
  }
}
</style>
