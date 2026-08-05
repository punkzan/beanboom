# Cloudflare 部署指南 — Bean Boom (拼豆扫雷)

## 架构

```
GitHub (源码) ──git push──→ Cloudflare Pages (前端 + API Functions)
                            ├─ 自动构建: npm run build
                            ├─ 静态文件: dist/
                            └─ API 路由: functions/api/[[route]].js
                                     ↓
                                  BEAN_BOOM_KV (数据存储)

GitHub Actions ──push workers/──→ Cloudflare Workers (Cron Worker)
                                  └─ 每分钟检查到期挑战 & 退款
```

**特点**：一个域名（`xxx.pages.dev`），前端和 API 同一域名，无 CORS 问题。全程自动部署，无需手动操作。

---

## 一、前期准备

1. [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
2. [GitHub 账号](https://github.com)
3. 将项目上传到 GitHub（公开或私有均可）

---

## 二、创建设置（仅需一次）

### 第 1 步：创建 KV 命名空间

进入 [Cloudflare Dashboard → Workers & Pages → KV](https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces)，创建命名空间：

- 名称：`BEAN_BOOM_KV`

记下创建的 **Namespace ID**（后面会用到）。

### 第 2 步：连接 GitHub 并部署 Pages

进入 [Cloudflare Dashboard → Workers & Pages → Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)：

1. 点击 **Create** → **Pages** → **Connect to Git**
2. 授权 GitHub，选择本项目仓库
3. 配置构建设置：

| 字段 | 值 |
|------|---|
| Framework preset | None / Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

4. 在 **Environment variables** 中添加生产环境变量（可选，默认使用占位值）：

| Variable | Value |
|----------|-------|
| 无需额外设置 | API 同域 `/api`，由 Pages Functions 自动处理 |

5. 点击 **Save and Deploy**，首次构建部署自动完成。

### 第 3 步：绑定 KV 到 Pages Functions

Pages 项目 → **Settings** → **Functions** → **KV namespace bindings**：

- Variable name：`BEAN_BOOM_KV`
- KV namespace：选择第 1 步创建的 `BEAN_BOOM_KV`

保存后 Pages 会自动重新部署。

### 第 4 步：迁移初始数据（首次）

在本地，将已有的挑战数据上传到 KV：

```bash
# 方式 A：使用 wrangler CLI
cd workers
npx wrangler kv:key put --namespace-id=<你的 KV Namespace ID> "challenges" --path=../server/data/challenges.json
npx wrangler kv:key put --namespace-id=<你的 KV Namespace ID> "payment_config" --path=../server/data/payment_config.json
npx wrangler kv:key put --namespace-id=<你的 KV Namespace ID> "participations" --value="[]"
npx wrangler kv:key put --namespace-id=<你的 KV Namespace ID> "users" --value="[]"
```

### 第 5 步：部署 Cron Worker

Cron Worker 负责每分钟检查到期挑战并自动退款。

1. 进入 [Cloudflare Dashboard → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. 点击 **Create** → **Workers** → **Create Worker**
3. 名称随意（如 `bean-boom-cron`），暂时用默认代码占位
4. 创建后进入 Worker → **Settings** → **Bindings**：
   - 添加 KV namespace binding：`BEAN_BOOM_KV` → 选择同一 KV 命名空间
5. 记下 Worker 名称，修改 `workers/wrangler.toml` 中：
   - `name` = 你的 Worker 名称
   - `[[kv_namespaces]].id` = 你的 KV Namespace ID
6. 在 GitHub 仓库设置 Secrets：
   - 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
   - 添加 `CLOUDFLARE_API_TOKEN`（在 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建，选 "Edit Cloudflare Workers" 模板）

```bash
# 首次手动部署 Cron Worker（后续 GitHub Actions 自动部署）
cd workers
npx wrangler deploy
```

---

## 三、日常使用

**之后每次更新，只需 `git push`：**

```
git add . && git commit -m "更新说明" && git push
```

- **前端 + API**：Cloudflare Pages 自动检测到 GitHub 推送，自动构建并部署（约 1-2 分钟）
- **Cron Worker**：仅当 `workers/` 目录有变更时，GitHub Actions 自动部署

---

## 四、项目结构

```
minesweeper-beads/
├── .env.development              # 本地开发用 localhost:3002
├── .env.production               # 生产用 /api（同域名，Pages Functions）
├── wrangler.toml                 # Pages 配置
├── dist/                         # Vite 构建产物
├── src/                          # 前端源码
│   └── core/
│       └── ChallengeAPI.js       # API 客户端（自动读取 VITE_API_BASE）
├── functions/                    # Pages Functions（API 后端）
│   └── api/
│       └── [[route]].js          # Hono 路由，处理所有 /api/* 请求
├── workers/                      # Cron Worker（定时退款）
│   ├── wrangler.toml
│   ├── src/cron.js
│   └── scripts/migrate-to-kv.js
├── .github/workflows/
│   └── deploy-cron.yml           # 自动部署 Cron Worker
└── server/                       # 旧版 Node.js 后端（参考，不再使用）
```

---

## 五、本地开发

```bash
# 启动 Pages 本地模拟（含 Functions）：
npm run dev

# 或者启动标准 Vite dev（不包含 API，需要单独起后端）：
cd server && node app.js   # 本地后端
npm run dev                # 前端
```

---

## 六、费用

| 服务 | 免费额度 | 状态 |
|------|---------|------|
| Pages（前端 + Functions）| 无限带宽 / 500 次构建/月 | ✅ |
| Workers（Cron）| 10 万请求/天 | ✅ 远够 |
| KV | 1 GB 存储 / 1000 万读/天 | ✅ |
| GitHub Actions | 2000 分钟/月 | ✅ |
| **总费用** | **$0/月** | |

---

## 七、常见问题

**Q: 前端如何知道 API 地址？**

Pages Functions 与前端同域名，所以 `.env.production` 中 `VITE_API_BASE=/api`。开发环境用 `http://localhost:3002/api`。

**Q: Pages Functions 和独立 Worker 有什么区别？**

Pages Functions 与静态资源同域名部署，天然解决 CORS，且无需管理额外的 Worker 路由。独立 Worker 仅用于 Cron 定时任务。

**Q: 数据安全吗？**

KV 全球分布式存储，Cloudflare 99.99% SLA。数据仅在 Cloudflare 内部网络传输。
