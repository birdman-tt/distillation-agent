# Hall of Fame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V1 Hall of Fame product as a public persona distillation platform with a shared backend, dual frontend targets (`H5` and `WeChat Mini Program`), and a controlled distillation/chat pipeline.

**Architecture:** The product uses a single Fastify API, a separate async worker for ingestion/distillation, and one Taro React client compiled to both H5 and WeChat Mini Program. Persona distillation is implemented as `source ingestion -> review -> structured profile extraction -> retrieval index -> constrained chat generation`, not fine-tuning.

**Tech Stack:** Taro, React, TypeScript, Fastify, Zod, PostgreSQL, pgvector, Redis/BullMQ, object storage, OpenAI-compatible model provider, WeChat Mini Program DevTools

---

## 1. 执行顺序总览

先按产品闭环排优先级，不按前后端分家。

### P0：必须先完成

- 本地开发环境和基础设施
- monorepo 脚手架与 workspace 命名
- 数据库 schema、基础 domain model、shared contracts
- 官方人物馆只读闭环
- 分享身份模型

### P1：第一阶段上线闭环

- 用户登录与会话
- 创建对象流程
- 资料导入与审核
- 蒸馏 worker 流水线
- 对话链路与拒答/冲突规则

### P2：第二阶段增强

- 精选分享对象运营位
- 对象反馈与质量回流
- 分享卡优化
- 数据观测与 prompt evaluation

## 2. 任务拆分与优先级

### Task 1: 项目脚手架与本地基础设施 `[P0]`

**目的：** 先把工程地基定住，后续所有任务才能并行。

**预计产出：**

- 新的 app/package 目录结构
- 本地 `docker-compose` 或等价开发基础设施
- `.env.example`
- 统一 `pnpm` workspace 配置

**建议责任人：**

- 全栈/平台工程优先

**依赖：**

- 无

**可并行性：**

- 低，建议最先完成

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/worker/package.json`
- Create: `apps/client/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/api-client/package.json`
- Create: `infra/docker-compose.yml`
- Create: `.env.example.hall-of-fame`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

- [ ] 统一确定 Hall of Fame 的 workspace 命名，不复用 `linkedin-assistant` 语义
- [ ] 新建 `apps/api`、`apps/worker`、`apps/client` 和 `packages/*` 基础目录
- [ ] 增加本地基础设施编排文件，至少启动 `PostgreSQL`、`Redis`、`MinIO`
- [ ] 统一项目环境变量模板，区分 `api`、`worker`、`client`、`miniapp`
- [ ] 约定 Node 和 pnpm 版本，并补到 README 或 `.nvmrc` / `.node-version`

### Task 2: 数据模型与 shared contracts `[P0]`

**目的：** 先把对象、版本、来源、聊天、分享这些核心边界定住，否则前后端会各写各的。

**预计产出：**

- 数据库 schema 初版
- zod contracts
- domain enums / state machine

**建议责任人：**

- 后端工程

**依赖：**

- Task 1

**可并行性：**

- 中，可和客户端只读页面脚手架并行，但必须优先于真实接口开发

**Files:**
- Create: `apps/api/src/db/schema.sql` or `apps/api/src/db/migrations/*`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/personae.ts`
- Create: `packages/contracts/src/chats.ts`
- Create: `packages/contracts/src/shares.ts`
- Create: `packages/domain/src/persona.ts`
- Create: `packages/domain/src/source.ts`
- Create: `packages/domain/src/share.ts`

- [ ] 定义 `users`、`auth_identities`、`sessions`
- [ ] 定义 `personae`、`persona_versions`、`persona_sources`、`persona_chunks`
- [ ] 定义 `share_links`、`chats`、`chat_messages`、`persona_feedback`
- [ ] 补全来源审核状态、对象状态、推演/拒答枚举
- [ ] 将 API request/response 形状统一写进 `packages/contracts`

### Task 3: 官方人物馆只读闭环 `[P0]`

**目的：** 最先跑通“用户进入 -> 看对象 -> 聊几句”的产品基本体验。

**预计产出：**

- featured 列表接口
- 对象详情接口
- 客户端首页和对象页

**建议责任人：**

- 前端 1 人
- 后端 1 人

**依赖：**

- Task 2

**可并行性：**

- 高

**Files:**
- Create: `apps/api/src/routes/personae/featured.ts`
- Create: `apps/api/src/routes/personae/detail.ts`
- Create: `apps/client/src/pages/index/index.tsx`
- Create: `apps/client/src/pages/persona/index.tsx`
- Create: `apps/client/src/features/hall/*`
- Create: `packages/api-client/src/personae.ts`

- [ ] 提供官方对象精选列表接口
- [ ] 提供对象详情接口，返回简介、推荐问题、对象版本信息
- [ ] 在客户端完成首页人物馆和对象详情页
- [ ] 补“未登录可试玩”的前端访问控制
- [ ] 用静态官方对象种子数据跑通首轮体验

### Task 4: 统一分享身份与落地页 `[P0]`

**目的：** 分享是主闭环，必须在早期就作为基础设施打通。

**预计产出：**

- `share_slug`
- `canonical_url`
- `miniapp_path`
- H5 分享落地页

**建议责任人：**

- 前端 1 人
- 后端 1 人

**依赖：**

- Task 2

**可并行性：**

- 高

**Files:**
- Create: `apps/api/src/routes/shares/*`
- Create: `apps/client/src/pages/share/index.tsx`
- Create: `apps/client/src/features/share/*`
- Create: `packages/contracts/src/share.ts`

- [ ] 实现 `share_links` 表及创建逻辑
- [ ] 为对象版本生成唯一 `share_slug`
- [ ] 定义 H5 分享落地页 route
- [ ] 约定微信内打开的跳转策略
- [ ] 前端分享 adapter 统一消费分享元数据

### Task 5: 登录与会话 `[P1]`

**目的：** 只在必要场景要求登录，并且保持 H5/小程序统一后端 token 体系。

**预计产出：**

- H5 登录
- 小程序登录
- refresh token
- 匿名试玩到正式账号的会话合并策略

**建议责任人：**

- 后端 1 人
- 客户端 1 人

**依赖：**

- Task 2

**可并行性：**

- 中

**Files:**
- Create: `apps/api/src/routes/auth/*`
- Create: `apps/client/src/adapters/auth/web.ts`
- Create: `apps/client/src/adapters/auth/weapp.ts`
- Create: `apps/client/src/services/auth/*`
- Create: `packages/contracts/src/auth.ts`

- [ ] 定义 Web 登录方式，优先手机号验证码或匿名会话
- [ ] 实现小程序 `wx.login` -> 后端会话交换
- [ ] 定义匿名会话并入正式账号策略
- [ ] 统一 access/refresh token 生命周期
- [ ] 客户端在“创建/收藏/发布”动作前触发登录门禁

### Task 6: 资料导入与审核 `[P1]`

**目的：** 用户创建对象的输入链路先跑通，但不能让抓取来的脏数据直接污染蒸馏。

**预计产出：**

- 文本导入
- URL 导入
- 资料审核状态机

**建议责任人：**

- 后端/worker 为主

**依赖：**

- Task 2
- Task 5

**可并行性：**

- 中

**Files:**
- Create: `apps/api/src/routes/personae/sources/*`
- Create: `apps/worker/src/jobs/source-ingest/*`
- Create: `apps/client/src/pages/create/index.tsx`
- Create: `apps/client/src/features/creation/*`
- Create: `packages/domain/src/source.ts`

- [ ] 实现文本资料录入接口
- [ ] 实现 URL 提交接口
- [ ] worker 拉取网页正文并写入 `PENDING_REVIEW`
- [ ] 定义 `APPROVED` / `REJECTED` 状态流转
- [ ] 只允许 `APPROVED` 资料进入蒸馏

### Task 7: 蒸馏 worker 流水线 `[P1]`

**目的：** 跑通“资料 -> 人物画像 -> 版本”的真正核心链路。

**预计产出：**

- 资料清洗
- 切块和 embedding
- `persona_profile.json`
- 版本化产物

**建议责任人：**

- AI/后端工程

**依赖：**

- Task 2
- Task 6

**可并行性：**

- 中

**Files:**
- Create: `apps/worker/src/jobs/distill/*`
- Create: `packages/prompt-kit/src/distill/*`
- Create: `packages/domain/src/persona-profile.ts`
- Create: `apps/api/src/routes/personae/distill.ts`

- [ ] 清洗资料并抽取元数据
- [ ] 为批准资料生成 embeddings 和 chunk 索引
- [ ] 提取结构化人物画像
- [ ] 生成推荐问题、示例回答、一句话人设
- [ ] 固化为 `persona_version`

### Task 8: 对话 runtime 与推演/拒答规则 `[P1]`

**目的：** 保证产品能聊，但不为了“像”而无限瞎编。

**预计产出：**

- chat runtime
- `grounded / inferred / insufficient_evidence`
- `conflictDetected`
- `refusalReason`

**建议责任人：**

- AI/后端工程

**依赖：**

- Task 7

**可并行性：**

- 中

**Files:**
- Create: `apps/api/src/routes/chats/*`
- Create: `apps/api/src/services/chat/*`
- Create: `packages/prompt-kit/src/chat/*`
- Create: `packages/contracts/src/chat.ts`
- Create: `apps/client/src/features/chat/*`

- [ ] 实现 chat session 创建和消息写入
- [ ] 按问题类型做检索和 prompt 组装
- [ ] 应用 `grounded / inferred / insufficient_evidence` 判定
- [ ] 加入冲突检测和拒答原因
- [ ] 前端显示“资料支撑 / 风格化推演 / 暂无法可靠回答”

### Task 9: 用户创建、预览、发布闭环 `[P1]`

**目的：** 跑通 V1 的第二条核心链路：用户也能创建并发布对象。

**预计产出：**

- 创建流程
- 预览页
- 发布/不发布选择

**建议责任人：**

- 前端 1 人
- 后端 1 人

**依赖：**

- Task 5
- Task 6
- Task 7

**可并行性：**

- 高

**Files:**
- Create: `apps/api/src/routes/personae/publish.ts`
- Create: `apps/client/src/pages/create/preview.tsx`
- Create: `apps/client/src/features/creation/preview/*`

- [ ] 创建页收集对象名、类型、资料、蒸馏重点
- [ ] 预览页展示人设、推荐问题、示例回答
- [ ] 支持“仅自己使用 / 公开分享”
- [ ] 公开发布前校验资料状态和风控条件
- [ ] 生成发布后的分享身份

### Task 10: 质量反馈、观测与开发保护网 `[P2]`

**目的：** 让蒸馏质量和线上行为可观测，否则后期会全靠体感调 prompt。

**预计产出：**

- feedback 采集
- job 可观测性
- prompt/eval 基线

**建议责任人：**

- 全栈/平台

**依赖：**

- Task 7
- Task 8

**可并行性：**

- 高

**Files:**
- Create: `apps/api/src/routes/feedback/*`
- Create: `apps/worker/src/observability/*`
- Create: `docs/evals.md`

- [ ] 记录“像不像 / 没依据”反馈
- [ ] 为关键 worker job 打日志和状态追踪
- [ ] 准备官方人物的回归问题集
- [ ] 建立最小 prompt evaluation 基线
- [ ] 加入限流、审计日志和失败告警

## 3. 并行建议

### 一人推进顺序

建议顺序：

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10

### 两人并行建议

- 人员 A：Task 1 -> 2 -> 5 -> 6 -> 7 -> 8
- 人员 B：Task 3 -> 4 -> 9 -> 10

其中 Task 3 和 Task 4 可以在 Task 2 结束后立即展开。

### 三人并行建议

- 后端/平台：Task 1 -> 2 -> 5
- AI/数据：Task 6 -> 7 -> 8
- 客户端：Task 3 -> 4 -> 9 -> 10

## 4. 本地开发环境准备

### 4.1 必备软件

- Node.js：建议 `22 LTS`
- pnpm：建议与仓库根目录统一，固定主版本
- Docker Desktop 或 Colima
- WeChat DevTools
- Git

### 4.2 本地服务

本地至少要能跑：

- PostgreSQL
- Redis
- MinIO 或等价 S3 mock

如果你希望最少折腾，建议直接走 `docker compose`。

### 4.3 建议环境变量

至少需要：

- `DATABASE_URL`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `OPENAI_API_KEY` 或等价模型供应商密钥
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `APP_BASE_URL`

### 4.4 小程序开发注意点

- 本地开发时要提前确定微信开发者工具调试方式
- 真机联调最终需要合法域名和 HTTPS
- 如果早期只在开发者工具里跑，可以先降低真机和域名要求

### 4.5 推荐本地启动方式

建议标准化成 5 个命令：

```bash
pnpm infra:up
pnpm dev:api
pnpm dev:worker
pnpm dev:client:h5
pnpm dev:client:weapp
```

## 5. 容易漏掉但必须补的前置项

这些不是“以后再说”的东西，建议尽早处理。

### 5.1 官方人物资料包

官方人物馆不是页面问题，而是内容工程问题。

你需要提前准备：

- 首批 6 个人物的资料源清单
- 每个人物的审核通过资料
- 每个人物的种子问题集

### 5.2 质量回归集

蒸馏产品如果没有固定问题集，后面每次改 prompt 都只能靠手感。

建议至少准备：

- 每个官方人物 20 个问题
- 其中包含：
  - 明确可回答问题
  - 需要推演的问题
  - 应该拒答的问题
  - 容易冲突的问题

### 5.3 观测和限流

别等上线后再补。

至少要有：

- job 失败日志
- API 请求日志
- 简单限流
- 对话失败追踪

### 5.4 分享域名与对象身份

分享是主闭环，域名不是上线前最后一天再定的事。

至少要提前决定：

- canonical 域名
- 分享页路径规则
- 小程序 page path 规则

### 5.5 审核责任边界

你现在的方案里已经决定“半自动抓取 + 人工审核”，那就必须有人承担这件事。

至少要先想清楚：

- 谁审核官方人物资料
- 谁审核用户公开对象
- 什么情况下直接拒绝发布

## 6. 推荐里程碑

### Milestone 1

目标：

- 官方人物馆可浏览
- 可进入对象详情
- 可进行基础对话
- 可生成分享落地页

### Milestone 2

目标：

- 用户可创建对象
- 可提交文本/URL
- 可完成蒸馏和预览
- 可公开发布

### Milestone 3

目标：

- 推演/拒答规则稳定
- 质量反馈闭环可用
- 小程序和 H5 分享链路都跑通

## 7. 我补充的建议

- 现在不要急着上“用户公开对象广场”，先靠官方人物馆和定向分享传播
- 最先做通的是“官方对象闭环”，不是“用户创建闭环”
- 本地环境尽量容器化，否则小程序、数据库、对象存储会把开发体验拖垮
- 官方人物的数据质量，重要性不低于代码质量
