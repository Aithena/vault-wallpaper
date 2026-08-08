# Awall 管理后台

管理端（Vite + Vue3 + TS + Less）。布局与菜单见仓库 [`docs/admin-ia.md`](../../docs/admin-ia.md)。

## 本地

```bash
# 终端 1：本地隔离 API（不打云端 KV，超限时也能调试）
pnpm dev:api

# 终端 2：后台
pnpm dev:admin
```

打开 http://localhost:18812。默认账号：`admin` / `admin123`（本地空库首次登录会自动种子）。

- `pnpm dev:api` → `wrangler dev --local`（本机 Miniflare，**不占** Cloudflare KV 免费额度）
- `pnpm dev:api:remote` → 连云端 KV/R2（账号已超限时会 429/500，仅在有额度时用）

UI：Element Plus。

已联调：登录、`/settings/admins` 员工管理 CRUD（列表/新增/编辑/改密/绑邮/启停）、角色管理。

## 当前进度

- ✅ 布局壳 A–F（顶栏 / 一级 / 二级 / 内容）
- ✅ 全部菜单静态页（列表、表单、占位）
- ⬜ `/api/admin/*` 联调
