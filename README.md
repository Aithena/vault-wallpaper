# Vault Wallpaper

实验项目：壁纸下载 + 邮箱验证码登录 + 小额终身会员（虎皮椒 / 本地模拟支付）。

## 结构

```text
apps/web     C 端（Vite + Vue3 + TS + Less）
apps/admin   管理端占位
apps/api     Cloudflare Workers + Hono
packages/shared  共享类型与价目表
```

管理后台菜单与需求基线见 [`docs/admin-ia.md`](docs/admin-ia.md)。

## 环境

- Node.js 20（当前 API 使用 wrangler@3，兼容 Node 20；若升到 wrangler@4 需 Node ≥ 22）
- pnpm 10+

## 本地启动

```bash
pnpm install

# 终端 1：API（18813，本地模拟 KV / R2）
pnpm dev:api

# 终端 2：C 端（18811，/api 代理到 18813）
pnpm dev:web

# 可选：管理端 18812
pnpm dev:admin
```

本地开发无需先建 Cloudflare 资源（Miniflare 会模拟 KV/R2）。上线前再在控制台创建真实 KV、R2，并更新 `apps/api/wrangler.toml`。未配置虎皮椒密钥时走**模拟支付**开通会员。

### 本地 R2 种子图（下载可用）

```bash
pnpm seed:r2
```

会把 `apps/api/fixtures/originals/*.jpg` 上传到本地 R2 的 `originals/{id}.jpg`。然后：登录 → 会员页开通 **全能 ¥29.9**（模拟支付）→ 首页点「下载原图」应直接下到 JPEG。

档位限制：`basic` 仅极光；`pro` 极光+雾港；`max` 全部。

## 实验闭环

1. 打开 C 端 → 邮箱登录（无 Resend 时接口返回 `previewCode`）
2. 会员页选择 9.9 / 19.9 / 29.9 → 模拟支付成功
3. 首页下载：走 `/api/wallpapers/:id/download`（R2 `originals/{id}.jpg`）
