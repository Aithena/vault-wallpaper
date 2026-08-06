# awall.cc 部署清单（Cloudflare）

域名：`awall.cc`  
规划：

| 主机 | 用途 |
|------|------|
| `awall.cc` / `www.awall.cc` | C 端 Pages |
| `api.awall.cc` | Workers API |

## 0. 登录 CLI（只需一次）

在本机终端执行（会打开浏览器授权）：

```bash
cd D:/Apps/vault-wallpaper/apps/api
pnpm exec wrangler login
```

## 1. 创建 KV + R2

```bash
cd D:/Apps/vault-wallpaper/apps/api
pnpm exec wrangler kv namespace create awall-kv
pnpm exec wrangler r2 bucket create awall-wallpaper
```

把输出的 KV `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]] id`。

## 2. 配置密钥

```bash
pnpm exec wrangler secret put JWT_SECRET
# 输入一串随机长密码

pnpm exec wrangler secret put EMAIL_FROM
# 先可填：onboarding@resend.dev
# 域名在 Resend 验证后改为：awall <noreply@awall.cc>

# 邮件等域名验证后再 put：
# pnpm exec wrangler secret put RESEND_API_KEY
```

## 3. 部署 API

```bash
cd D:/Apps/vault-wallpaper
pnpm deploy:api
pnpm exec wrangler --cwd apps/api domains add api.awall.cc
```

（若 `domains add` 不可用：Dashboard → Workers → vault-wallpaper-api → Triggers → Custom Domains → `api.awall.cc`）

## 4. 部署 C 端

```bash
cd D:/Apps/vault-wallpaper
pnpm deploy:web
```

Dashboard → Workers & Pages → awall-web → Custom domains → 添加 `awall.cc`（可选 `www.awall.cc`）

## 5. 上传壁纸原图到线上 R2

```bash
cd apps/api
pnpm exec wrangler r2 object put awall-wallpaper/originals/wp-aurora.jpg --file=./fixtures/originals/wp-aurora.jpg --content-type=image/jpeg
# harbor / neon 同理
```

## 6. Resend 验域名（发真邮件）

1. [resend.com/domains](https://resend.com/domains) → Add `awall.cc`
2. 按提示在 Cloudflare DNS 加 TXT/MX/CNAME
3. Verify 通过后：`EMAIL_FROM=awall <noreply@awall.cc>` + `RESEND_API_KEY`
