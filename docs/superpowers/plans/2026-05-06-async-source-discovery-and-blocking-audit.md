# 异步资料发现与同步阻塞排查方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. 每个开发阶段完成后必须经过 subagent 的业务符合性 review 和技术验收 review。

**目标：** 把 Kimi 资料搜索从同步 HTTP 请求中移出，改成后台 source discovery job；同时把全链路同步阻塞点分级，避免后续继续把长耗时任务塞进用户请求。

**架构：** API 只做鉴权、校验、任务创建和状态读取；Kimi search、URL 抓取、资料清洗、画像合成等长耗时任务都由 worker 消费持久化 job 完成。前端通过轮询先拿状态，完成后再进入资料确认和蒸馏 job 创建。

**Tech Stack:** Fastify、TypeScript、PostgreSQL/Supabase、Taro/H5 client、Kimi `$web_search`、DeepSeek、MiniMax planner、pnpm workspace。

---

## 1. 本次已收敛的 Kimi 改动

官方文档确认 `$web_search` 推荐使用 `kimi-k2.6`，并要求：

- `tools` 使用 `type: "builtin_function"` 和 `function.name: "$web_search"`。
- 请求体禁用 thinking：`thinking: { "type": "disabled" }`。
- 每轮请求都完整带上 tools。
- 返回 `finish_reason=tool_calls` 后，把 assistant message 和 `role=tool` message 追加回上下文。
- `role=tool.content` 原样提交 `tool_call.function.arguments` 的 JSON 字符串，由 Kimi 执行真实联网搜索。

已完成的代码级收敛：

- `apps/api/src/services/kimi/kimi-researcher.ts` 默认模型改为 `kimi-k2.6`。
- `apps/api/src/routes/chats.ts` 中 Kimi research 元数据默认模型改为 `kimi-k2.6`。
- `apps/api/src/services/minimax-planner/chat-planner.ts` 中 Kimi planner fallback 默认模型改为 `kimi-k2.6`。
- `scripts/check-kimi-web-search.ts` 默认模型改为 `kimi-k2.6`。
- `.env.example.hall-of-fame` 和 `infra/deploy/.env.example.*` 中 `KIMI_MODEL` 改为 `kimi-k2.6`。
- 相关测试常量改为 `kimi-k2.6`。

已验证现象：

- `kimi-k2.5` 下第二轮搜索可能返回 `429 The engine is currently overloaded, please try again later`。
- `kimi-k2.6` 下同一脚本可以完成 `$web_search` tool call，但第二轮搜索耗时约 35 秒。
- 结论：Kimi search 可用，但耗时和过载都证明它不能放在同步创建接口里。

---

## 2. 同步 / 异步判定规则

### 必须保持同步的接口

这类接口只能做轻量工作，目标是稳定低延迟：

- 登录、匿名会话、刷新 token。
- 轻量 CRUD：创建 intent、读取对象列表、读取 job 状态、确认对象、删除对象。
- 聊天消息接口的最终回复生成可以同步，因为用户正在等待一条回复。

约束：

- 同步接口仍必须有超时、fallback 或明确失败。
- 同步接口不能等待外部搜索、URL 抓取、批量清洗、批量 embedding、媒体生成。

### 必须异步化的任务

这些动作必须通过持久化 job 进入 worker：

- Kimi web search 资料发现。
- URL 抓取和正文提取。
- 一键蒸馏 profile 合成。
- 批量证据抽取、质量评分、candidate version 持久化。
- 批量 embedding。
- 分享图、媒体素材生成。

### 可同步但必须降级的链路

聊天内的 web search 是特殊情况。用户确实在等回复，但 web search 不应该拖死整次回复：

- `POST /v1/chats/:chatId/messages` 可以同步生成回复。
- 如果 planner 需要 Kimi search，必须给 Kimi research 一个硬超时。
- 超时或 Kimi 过载时，聊天继续使用已有资料和记忆生成回复，并在 trace 内记录 `kimi_unavailable`。
- 不在用户 UI 展示内部错误和模型细节。

---

## 3. 当前同步阻塞排查结果

| 优先级 | 链路 | 当前行为 | 判断 | 处理方式 |
| --- | --- | --- | --- | --- |
| P0 | `POST /v1/persona-distill-source-discovery` | API 内直接 `await runKimiResearcher` | 必须异步化 | 改成创建 `sourceDiscoveryJob` 后立即返回 |
| P0 | `/create` 前端创建流程 | 提交后等待 discovery 接口完成才展示资料 | 必须异步化 | 创建 discovery job 后轮询 job 状态 |
| P1 | `POST /v1/personae/:personaId/distill` | 旧接口同步调用 worker `/internal/distill` | 遗留阻塞接口 | 标记 legacy，后续统一接入 distill job 或返回 410 |
| P1 | `POST /v1/personae/:personaId/sources/url` | 旧接口同步调用 worker `/internal/source-ingest` | 遗留阻塞接口 | 改成 source ingest job；当前不是一键创建主链路 |
| P1 | `POST /internal/distill` | worker 内部同步执行 DeepSeek 蒸馏 | 只能内部调试使用 | 不给用户链路调用；后续保留为 dev/manual 或删除 |
| P1 | `POST /internal/source-ingest` | worker 内部同步执行 URL ingest | 只能内部调试使用 | 不给用户链路调用；后续保留为 dev/manual 或删除 |
| P2 | `POST /v1/chats/:chatId/messages` 的 Kimi research | 同步等待 Kimi search | 可同步但要降级 | 增加硬超时，超时后继续聊天 |
| P2 | chat context query embedding | 聊天请求内同步等待 Qwen query embedding | 可同步但要降级 | 增加硬超时，超时后退回 FTS / recent memory |
| P2 | chat DeepSeek reply | 同步等待 DeepSeek 回复 | 产品交互允许 | 加超时与 fallback 已有雏形，后续统一 abort |
| P2 | embedding scheduler | API 进程 fire-and-forget 调 Qwen | 不阻塞用户但不可靠 | 后续改持久化 embedding job |

---

## 4. 目标接口设计

### 4.1 创建 source discovery job

保留现有入口名，改变语义：从“同步返回 discovery”改成“创建 discovery job”。

```http
POST /v1/persona-distill-source-discovery
```

请求不变：

```json
{
  "intentId": "uuid",
  "preferredLanguage": "zh-CN",
  "maxSourcesPerBucket": 4
}
```

响应改为：

```json
{
  "sourceDiscoveryJobId": "uuid",
  "intentId": "uuid",
  "status": "QUEUED",
  "currentStep": "准备搜索资料",
  "progress": 5,
  "discoveryId": null,
  "nextAction": "POLL_SOURCE_DISCOVERY",
  "pollHref": "/v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId"
}
```

接口行为：

- 校验 actor session。
- 校验 intent 属于当前用户。
- 如果 intent 风险不是 `ALLOW`，不创建 job，直接返回业务错误。
- 写入 `persona_distill_source_discovery_jobs`。
- 立即返回，不调用 Kimi。

### 4.2 轮询 source discovery job

```http
GET /v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId
```

处理中响应：

```json
{
  "sourceDiscoveryJobId": "uuid",
  "intentId": "uuid",
  "status": "SEARCHING",
  "currentStep": "搜索公开资料",
  "progress": 35,
  "discoveryId": null,
  "discovery": null,
  "error": null,
  "nextAction": "POLL_SOURCE_DISCOVERY"
}
```

成功响应：

```json
{
  "sourceDiscoveryJobId": "uuid",
  "intentId": "uuid",
  "status": "SUCCEEDED",
  "currentStep": "资料已找到",
  "progress": 100,
  "discoveryId": "uuid",
  "discovery": {
    "discoveryId": "uuid",
    "normalizedName": "纪晓岚",
    "entityType": "REAL_PERSON",
    "riskDecision": "ALLOW",
    "bucketCoverage": {},
    "sourceCandidates": [],
    "missingBuckets": [],
    "qualityWarnings": [],
    "sanitizerVersion": "kimi-web-search-v1"
  },
  "error": null,
  "nextAction": "CONFIRM_SOURCES"
}
```

失败响应：

```json
{
  "sourceDiscoveryJobId": "uuid",
  "intentId": "uuid",
  "status": "FAILED",
  "currentStep": "资料搜索失败",
  "progress": 100,
  "discoveryId": null,
  "discovery": null,
  "error": {
    "code": "SOURCE_SEARCH_BUSY",
    "message": "搜索服务繁忙，可以稍后重试",
    "retryable": true
  },
  "nextAction": "RETRY_SOURCE_DISCOVERY"
}
```

注意：

- API 对用户返回的 `error.message` 必须是产品安全文案，例如“搜索服务繁忙，可以稍后重试”。
- API 对用户返回的 `error.code` 必须是产品语义错误码，例如 `SOURCE_SEARCH_BUSY`；内部 DB / trace 可保留 `KIMI_OVERLOADED`。
- Kimi 原始错误、HTTP status、tool arguments、模型名、trace 只允许进入内部日志或 debug trace。
- 前端不得直接渲染 DB 内部 `error_message` 原文。

### 4.3 重试 source discovery job

```http
POST /v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId/retry
```

响应：

```json
{
  "sourceDiscoveryJobId": "new-uuid",
  "intentId": "uuid",
  "status": "QUEUED",
  "currentStep": "准备重新搜索资料",
  "progress": 5,
  "discoveryId": null,
  "nextAction": "POLL_SOURCE_DISCOVERY",
  "pollHref": "/v1/persona-distill-source-discovery-jobs/new-uuid"
}
```

语义：

- 只允许 owner 重试自己的 `FAILED retryable=true` job。
- 不复用失败 job 的 id，创建一个新的 job，便于保留失败历史。
- 新 job 复用原 intent、preferredLanguage、maxSourcesPerBucket。
- 前端收到新 job 后替换 URL 为 `/create?sourceDiscoveryJobId=new-uuid`。

### 4.4 状态枚举

```text
QUEUED      已创建，等待 worker
CLAIMED     worker 已领取
SEARCHING   正在调用 Kimi web search
PERSISTING  正在写入 discovery 和 candidates
SUCCEEDED   可进入资料确认
FAILED      搜索失败，可重试或返回创建页
BLOCKED     风险或权限阻断
```

---

## 5. 数据库设计

新增表：

```sql
CREATE TABLE persona_distill_source_discovery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES persona_distill_intents(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_language TEXT NOT NULL DEFAULT 'zh-CN',
  max_sources_per_bucket INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  current_step TEXT NOT NULL DEFAULT '准备搜索资料',
  progress INTEGER NOT NULL DEFAULT 0,
  discovery_id UUID REFERENCES persona_distill_discoveries(id) ON DELETE SET NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  safe_error_message TEXT,
  retryable BOOLEAN NOT NULL DEFAULT false,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_by_worker_id TEXT,
  claimed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX persona_distill_source_discovery_jobs_status_due_idx
  ON persona_distill_source_discovery_jobs (status, next_run_at ASC, created_at ASC);

CREATE INDEX persona_distill_source_discovery_jobs_creator_updated_idx
  ON persona_distill_source_discovery_jobs (created_by_user_id, updated_at DESC);
```

设计理由：

- discovery 结果只有成功后才存在，所以不能只复用 `persona_distill_discoveries` 表表示任务状态。
- job 表保存错误、进度、重试、worker claim 信息。
- `discovery_id` 成功后关联最终资料候选结果。

---

## 6. 后端实施方案

### Task 1: 抽出 Kimi researcher 到 shared package

原因：

- 当前 `runKimiResearcher` 位于 `apps/api/src/services/kimi/kimi-researcher.ts`。
- source discovery 改到 worker 后，worker 不应该反向 import API app 内部代码。
- 当前候选资料分类、bucket 推断、risk flags、dedupe 等逻辑在 API repository 附近，也不能被 worker 反向 import。

改动：

- 新增 `packages/kimi-client/src/kimi-researcher.ts`。
- 新增 `packages/kimi-client/package.json` 和 tsconfig。
- 新增或补充 `packages/domain/src/distill-source-discovery.ts`，放置纯函数：
  - `classifySource`
  - `inferBucketFromSource`
  - `detectSourceRiskFlags`
  - `buildSourceCandidatesFromWebContext`
  - `createBucketCoverage`
  - `buildDiscoveryQualityWarnings`
- API chat 改为从 `@hall-of-fame/kimi-client` import。
- 后续 worker source discovery 也从该 package import。
- API repository 只保留 DB 读写，不再持有 Kimi 调用或候选构建私有逻辑。

验收：

- Kimi researcher 测试迁移到 package。
- source candidate 构建逻辑有 domain 单测覆盖 dedupe、risk、bucket、trust classification。
- API 不再拥有 Kimi provider 实现，只消费 package。
- Worker 不 import `apps/api/src/**`。

### Task 2: 增加 source discovery job contract

改动：

- `packages/contracts/src/persona-distill.ts` 增加：
  - `sourceDiscoveryJobStatusSchema`
  - `createDistillSourceDiscoveryJobResponseSchema`
  - `distillSourceDiscoveryJobResponseSchema`
- 保留 `distillSourceDiscoveryResponseSchema` 作为成功后 `discovery` 字段。

验收：

- Contract test 覆盖 queued、searching、succeeded、failed 四种响应。

### Task 3: 增加 DB schema/bootstrap

改动：

- `apps/api/src/db/schema.sql` 增加 `persona_distill_source_discovery_jobs`。
- `apps/api/src/db/bootstrap.ts` 增加 `CREATE TABLE IF NOT EXISTS` 和索引。
- 如 worker 有独立 bootstrap，也同步补齐。

验收：

- API bootstrap 测试能创建表。
- 本地 Supabase/Postgres 可重复启动，不因表已存在报错。

### Task 4: API 创建 discovery job，不再调用 Kimi

改动：

- `createDistillSourceDiscovery` 改为只创建 job row。
- 新增 `getDistillSourceDiscoveryJob`。
- 新增 `retryDistillSourceDiscoveryJob`。
- `apps/api/src/routes/persona-distill.ts`：
  - `POST /v1/persona-distill-source-discovery` 返回 job response。
  - 新增 `GET /v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId`。
  - 新增 `POST /v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId/retry`。

验收：

- 关闭 Kimi API key 时，POST discovery 仍能返回 `QUEUED`。
- 该接口耗时不依赖 Kimi，可在单测中断言不会调用 `runKimiResearcher`。
- 非 owner 查询 job 返回 404 或 403，遵循现有 owner-only 风格。
- retry 只允许 `FAILED retryable=true` 的 owner job；成功后返回新的 `sourceDiscoveryJobId`。

### Task 5: Worker 执行 source discovery job

改动：

- 新增 `apps/worker/src/jobs/persona-source-discovery/run-persona-source-discovery-jobs.ts`。
- 实现 claim：
  - `status='QUEUED'`
  - `next_run_at <= now()`
  - `FOR UPDATE SKIP LOCKED`
- 实现 stale reclaim：
  - `CLAIMED / SEARCHING / PERSISTING` 且 `heartbeat_at < now() - interval '180 seconds'` 的 job 可回收。
  - `PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS` 默认值为 `3`。
  - `attempt_count < PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS` 时回到 `QUEUED`，`next_run_at = now()`。
  - 超过最大次数后进入 `FAILED retryable=true`。
  - `SUCCEEDED / FAILED / BLOCKED` 终态永不再 claim。
- 执行流程：
  - `CLAIMED`
  - `SEARCHING`
  - 调 Kimi `runKimiResearcher`
  - 分类、去重、risk flags、bucket coverage
  - `PERSISTING`
  - 同事务写 `persona_distill_discoveries` 和 `persona_distill_source_candidates`
  - job `SUCCEEDED`
- 错误处理：
  - Kimi overloaded / 429：写内部 `error_code='KIMI_OVERLOADED'`，`safe_error_message='搜索服务繁忙，可以稍后重试'`。
  - 前 2 次 retryable 错误自动设置 `status='QUEUED'`，`next_run_at = now() + backoff`，backoff 为 15s、45s。
  - 超过最大次数后 `FAILED retryable=true`。
  - Kimi 无结果：`FAILED retryable=true`，`safe_error_message='暂时没有找到可用资料，可以重试或手动补充资料'`。
  - intent 风险变化：`BLOCKED retryable=false`。

验收：

- Worker 单测覆盖成功、overloaded 重试、最终 failed、owner 隔离。
- `runDuePersonaSourceDiscoveryJobs` 返回 `{ claimed, succeeded, failed, retried }`。
- 人为构造 stale `SEARCHING` job 后，下一轮 worker 可以回收或标记失败。
- API response 不包含 Kimi 原始错误；内部日志保留原始错误。

### Task 6: Worker app 接入 discovery poller

改动：

- `apps/worker/src/app.ts` 增加：
  - `/internal/persona-source-discovery/run-due`
  - `PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED`
  - `PERSONA_SOURCE_DISCOVERY_POLL_INTERVAL_MS`
- 开发环境默认启用；生产环境显式启用。

验收：

- health 不代表 poller，但启动日志要明确 poller 是否启用。
- 本地 `pnpm dev:all` 能自动消费 source discovery job。

### Task 7: 前端创建流程改为 discovery polling

改动：

- `packages/api-client/src/personae.ts`：
  - `discoverDistillSources` 返回 source discovery job response。
  - 新增 `getDistillSourceDiscoveryJob`。
- `apps/client/src/h5-app.ts`：
  - 创建 intent 后调用 POST discovery，立即进入“搜索资料中”状态。
  - URL 进入 `/create?sourceDiscoveryJobId=...`，支持刷新恢复。
  - 轮询 GET source discovery job。
  - `SUCCEEDED` 后调用原 `renderDiscovery(discovery)`。
  - `FAILED retryable=true` 展示“重试搜索 / 手动补资料”；点击重试调用 retry endpoint，并替换 URL 为新 job。
  - 创建 distill job 后切到现有 `/create?jobId=...` 轮询。

验收：

- 用户不会在 POST discovery 请求上卡 30 秒。
- 页面刷新不丢失正在搜索资料的状态。
- 资料搜索失败不会显示 Kimi、429、engine overloaded 等内部信息。
- `apps/client/src/chat-behavior.test.ts` 更新为断言 source discovery job + polling，而不是同步 discovery response。
- `apps/api/src/persona-distill-v2.test.ts` 更新为断言 POST discovery 立即返回 job，worker run-due 后 GET job 包含 discovery。

### Task 8: 标记或收口遗留同步阻塞接口

本轮不要求完全重构旧版 persona 管理接口，但必须防止它们继续被新创建流程依赖：

- `/v1/personae/:personaId/distill`
- `/v1/personae/:personaId/sources/url`
- `/internal/distill`
- `/internal/source-ingest`

处理策略：

- 文档标记 legacy/debug-only。
- 新创建流程不调用这些接口。
- 排查 H5/UI 是否仍有入口；如果仍有入口，先隐藏入口或迁移到 job。
- 增加 `LEGACY_SYNC_PERSONA_MANAGE_ENABLED` feature flag。
- flag 显式为 `true` 时启用，显式为 `false` 时禁用；未设置时 dev/test 默认启用，production 默认关闭。
- 关闭时 product-facing 旧同步接口返回 `410` 和安全文案。
- `/v1/personae/:personaId/sources/url` 的 gate 必须在写入 `persona_sources` 和调用 `/internal/source-ingest` 前执行。
- `/v1/personae/:personaId/distill` 的 gate 必须在 `prepareDistillInput` 和调用 `/internal/distill` 前执行。
- internal worker endpoint 仅保留给本地调试或测试，不作为业务 API 依赖。

验收：

- `packages/api-client/src/personae.ts` 不再被创建主流程调用旧 `distillPersona`。
- 如果 legacy flag 关闭，`/v1/personae/:personaId/distill` 和 `/v1/personae/:personaId/sources/url` 不会触发 worker 同步调用。

### Task 9: 聊天 Kimi research 加硬超时降级

改动：

- `packages/kimi-client` 的 `runKimiResearcher` 支持 `signal?: AbortSignal`。
- `apps/api/src/routes/chats.ts` 对 Kimi research 使用 `AbortController` 和 `CHAT_KIMI_RESEARCH_TIMEOUT_MS`。
- 默认超时建议 30000ms；聊天回复已支持异步等待，Kimi search 可以比普通同步请求等更久。超时后生成 `unavailableWebContext`，聊天继续进入 DeepSeek/fallback 回复。
- `unavailableWebContext.uncertainty` 只能使用安全通用文案，不得包含 Kimi、timeout、429、tool call 或供应商错误原文。
- trace 可记录 `timedOut`、`timeoutMs`、内部 `errorMessage`，但不得进入 prompt-facing webContext。
- trace 记录 `chat.kimi.research.failed`，内部 fields 可记录 `timeout`，用户消息不展示。

验收：

- 单测模拟 Kimi never resolves，接口仍继续生成回复。
- trace 中有 Kimi timeout 事件。
- 用户响应不包含 Kimi、timeout、429、tool call 等内部词。

### Task 10: 聊天 query embedding 加硬超时降级

改动：

- `apps/api/src/services/chat-memory/assemble-chat-context.ts` 中 Qwen query embedding 使用 `AbortController` 和 `Promise.race`。
- `requestQwenEmbeddings` 支持 `signal?: AbortSignal`，确保超时后底层 fetch 也能中断。
- 新增 `CHAT_QUERY_EMBEDDING_TIMEOUT_MS`，默认 800ms，最低 50ms，已同步到本地、staging、production env example。
- 超时后跳过 vector retrieval，保留 FTS、recent turns、persona evidence。
- diagnostics 写 `vectorSearch.errorMessage='query_embedding_timeout'`，不影响聊天回复。
- 本阶段只限制外部 Qwen query embedding 请求；Postgres vector 查询仍使用现有数据库超时策略，不在本任务内额外包 timeout。

验收：

- 单测模拟 embedding hang，`assembleChatContext` 返回成功且 `retrievalMode` 退回 `fts_only`。
- 单测验证 `requestQwenEmbeddings` 会把 `AbortSignal` 传到底层 fetch。
- 聊天接口不因 Qwen query embedding 慢而阻塞。

---

## 7. 排查计划

每次进入接口重构前必须跑一遍：

```bash
rg -n "await .*fetch|fetch\\(|runKimiResearcher|requestStructuredJson|runMiniMaxPlanner|ViaWorker|/internal/distill|/internal/source-ingest" apps packages -g"*.ts"
```

补充检索：

```bash
rg -n "requestQwenEmbeddings|requestEmbeddings|enqueue.*Embedding|AbortController|withTimeout|setTimeout" apps packages -g"*.ts"
```

人工分类输出：

- 用户请求内是否等待外部网络。
- 是否调用模型或搜索。
- 是否有 timeout / abort。
- 是否有 fallback。
- 是否已有持久化 job。
- 是否会被 `/create` 主流程调用。
- 是否会被聊天消息请求调用。

当前必须重点复查文件：

- `apps/api/src/routes/persona-distill.ts`
- `apps/api/src/db/repositories/persona-distill-repository.ts`
- `apps/api/src/routes/chats.ts`
- `apps/api/src/workflows/chat/run-chat-workflow.ts`
- `apps/api/src/routes/personae/manage.ts`
- `apps/api/src/services/worker-client.ts`
- `apps/api/src/services/chat-memory/assemble-chat-context.ts`
- `apps/api/src/services/embeddings/*`
- `apps/worker/src/app.ts`
- `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`
- `apps/client/src/h5-app.ts`
- `packages/api-client/src/personae.ts`

---

## 8. Subagent review 要求

计划 review 必须回答：

- 是否真正消除了 `/v1/persona-distill-source-discovery` 同步等待 Kimi 的问题。
- 是否遗漏了 `/create` 主链路上的阻塞点。
- source discovery job 的状态机是否足够支撑前端恢复和失败重试。
- worker 是否有明确 owner、claim、retry、terminal state。
- Kimi provider 是否从 API app 正确下沉到 shared package，避免 worker 反向依赖 API。
- 是否有过度设计；V1 是否可以先 polling，不引入 SSE/WebSocket。
- 是否保护用户 UI，不展示 Kimi、模型名、429、tool trace 等内部信息。
- 是否定义 stale job reclaim、retry endpoint、backoff 和终态不可再 claim。
- 是否覆盖聊天 Kimi research 和 query embedding 的同步降级。

开发验收必须回答：

- 单测和 typecheck 是否通过。
- 本地 create flow 是否能从 intent -> sourceDiscoveryJob -> discovery succeeded -> source confirmation -> distill job。
- 人为制造 Kimi overloaded 是否会进入 retry/failed，而不是让 POST 请求返回 400。
- 前端刷新 `/create?sourceDiscoveryJobId=...` 是否能恢复进度。
- 人为制造 worker 中断后，stale source discovery job 是否能被回收。
- 人为制造 Kimi/embedding timeout 后，聊天是否仍能回复。

---

## 9. 本轮不做的事

- 不引入 SSE/WebSocket；V1 先用 polling。
- 不把聊天消息接口整体异步化。
- 不在用户界面展示 tool trace、模型名、质量分、prompt 或 Kimi 错误原文。
- 不把旧版 persona 管理接口一次性全部重构；只确保新创建流程不再依赖它们。
