# Awall 管理后台

管理端（Vite + Vue3 + TS + Less）。布局与菜单见仓库 [`docs/admin-ia.md`](../../docs/admin-ia.md)。

## 本地

```bash
pnpm dev:admin
```

打开 http://localhost:18812 （需同时 `pnpm dev:api`）。UI：Element Plus。默认账号：`admin` / `admin123`。

已联调：登录、`/settings/admins` 员工管理 CRUD（列表/新增/编辑/改密/绑邮/启停）、角色管理。

## 当前进度

- ✅ 布局壳 A–F（顶栏 / 一级 / 二级 / 内容）
- ✅ 全部菜单静态页（列表、表单、占位）
- ⬜ `/api/admin/*` 联调
