# My Objects And Tool-Based Distill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户侧产品收敛为“创建对象 -> 我的对象 -> 对象详情 -> 纯聊天/管理操作”，并把后端蒸馏升级为模型驱动的 tool function runtime。

**Architecture:** 先建立稳定的 owner object 身份，让对象从创建中、待确认、可聊天、已公开到删除都使用同一个 `objectId`。用户体验层把聊天和管理分离；后端先用现有 persona/version/job 能力支撑产品闭环，再把蒸馏 worker 重构为确定性状态机约束下的模型 tool calling flow。

**Tech Stack:** TypeScript, Fastify, Zod contracts, PostgreSQL/Supabase, pnpm workspace, H5 client in `apps/client/src/h5-app.ts`, API in `apps/api`, worker in `apps/worker`.

---

## 0. 执行规则

本计划必须顺序执行。每个 task 都要走同一套 gate：

1. 主 agent 为当前 task 输出详细落地计划，说明业务目标、技术改动、文件范围、测试方式、风险。
2. review subagent 审查该 task 计划是否符合当前业务要求和技术要求。
3. 如果 review 不通过，主 agent 修正 task 计划，再交给 subagent 复审，直到通过。
4. 主 agent 按通过后的 task 计划实施。
5. 主 agent 跑本 task 必要测试。
6. review subagent 做完成验收：业务符合性、技术符合性、测试充分性。
7. 如果验收不通过，主 agent 修改实现并重新测试，再交给 subagent 复审，直到通过。
8. 当前 task 通过后，才能进入下一个 task。

第 7/8 步属于后端蒸馏核心重构，必须额外做模型能力审查：

- 当前模型是否适合承担该角色。
- 是否需要 function calling。
- 是否需要长上下文资料抽取。
- 是否需要强推理合成。
- 是否应该用确定性脚本代替模型判断。
- 模型是否可能绕过关键校验，代码状态机如何阻断。

## 1. 不变原则

产品规则来自根目录 `AGENTS.md`：

> Product-facing output should be simple, direct, and useful to the user.

落地解释：

- 用户侧不展示质量分、coverage score、style score、evidence score、模型调用、tool call、prompt、worker trace、review/admin 状态。
- 系统状态必须翻译成用户语言，例如 `需要补资料`、`创建中`、`生成失败`。
- 聊天页必须保护氛围，只展示对象名、消息、输入框、正在输入状态、必要返回。
- 管理操作放在 `我的 -> 我的对象 -> 对象详情`。
- 创建流程只展示用户下一步需要做什么，不展示完整蒸馏流水线。

## 2. 最终产品流

```text
创建
  -> 输入对象
  -> 搜索/确认资料
  -> 开始生成
  -> 生成完成
  -> 我的 -> 我的对象
  -> 对象详情
  -> 聊天 / 编辑 / 补资料 / 删除 / 分享
```

页面职责：

- `/`：内置/推荐对象入口。
- `/history`：聊天会话列表。
- `/create`：创建对象。
- `/profile`：个人入口，只展示少量入口。
- `/profile/objects`：我的对象列表。
- `/profile/objects/:objectId`：对象详情和管理动作。
- `/profile/objects/:objectId/chat`：自建对象纯聊天。
- `/persona/:personaId`：公开对象纯聊天。
- `/share/:slug`：分享对象纯聊天或分享落地页。
- `/preview/:personaVersionId`：兼容旧链接，普通用户访问时重定向到对象详情或纯聊天；不得展示内部指标。

## 3. 稳定 Object Identity

### 3.1 新增 owner object 概念

必须新增或等价实现一张稳定身份表，推荐表名：

```text
owned_persona_objects
```

推荐字段：

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
active_persona_version_id UUID REFERENCES persona_versions(id) ON DELETE SET NULL,
source_distill_job_id UUID REFERENCES persona_distill_jobs(id) ON DELETE SET NULL,
display_name TEXT NOT NULL,
intro TEXT,
status TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at TIMESTAMPTZ
```

稳定身份规则：

- 创建 distill job 时创建 `owned_persona_objects`，`objectId = owned_persona_objects.id`。
- job 运行中：object 绑定 `source_distill_job_id`，`persona_id` 和 `active_persona_version_id` 可以为空。
- job 成功：object 绑定 `persona_id` 和 candidate `active_persona_version_id`。
- 用户确认私用：同一个 object 转为 `READY`，不换 `objectId`。
- 用户公开：同一个 object 转为 `PUBLIC`，不换 `objectId`。
- 用户补资料重新蒸馏：同一个 object 绑定新的 distill job，成功后更新 `active_persona_version_id`。
- 用户删除：同一个 object 写 `deleted_at`，不复用 `objectId`。
- 旧数据 backfill：已有 user persona/version/job 必须生成 object row，确保 inventory 和详情页都能打开。

### 3.2 用户对象状态

用户侧统一状态：

```ts
type MyObjectStatus =
  | "CREATING"
  | "NEEDS_SOURCES"
  | "PENDING_CONFIRM"
  | "READY"
  | "PUBLIC"
  | "FAILED"
  | "DELETED";
```

状态映射：

```text
object.deleted_at is not null -> DELETED
distill job QUEUED/CLAIMED/RUNNING -> CREATING
distill job NEEDS_MORE_SOURCES -> NEEDS_SOURCES
distill job FAILED -> FAILED
persona version CANDIDATE -> PENDING_CONFIRM
object confirmed private/current draft -> READY
persona current_published_version_id/share -> PUBLIC
```

### 3.3 确认闭环

`PENDING_CONFIRM` 不能只靠 publish 语义处理。

必须提供用户语言的确认动作：

```http
POST /v1/me/objects/:objectId/confirm
```

含义：

- 把 candidate 保存为自己的可聊天对象。
- 用户文案是 `保存到我的对象` 或 `开始使用`，不是 `发布`。
- 后端可以复用现有 private publish/store 逻辑，但 API 和前端文案不能暴露 publish 概念。

公开分享仍是独立动作：

```http
POST /v1/me/objects/:objectId/publish
```

如果公开失败，普通用户只看到简短原因，例如 `暂时不能公开，可以先自己使用`。

### 3.4 我的对象接口

`GET /v1/me/persona-inventory` 可以继续作为 V1 列表数据源，但 response 必须是用户视角。

```ts
type MyObjectListItem = {
  objectId: string;
  personaId: string | null;
  personaVersionId: string | null;
  sourceDistillJobId: string | null;
  displayName: string;
  intro: string | null;
  status: MyObjectStatus;
  updatedAt: string;
  primaryAction: "VIEW_PROGRESS" | "ADD_SOURCES" | "OPEN_DETAIL" | "CHAT" | "RETRY";
  primaryHref: string;
  availableActions: Array<"CHAT" | "EDIT" | "ADD_SOURCES" | "DELETE" | "CONFIRM" | "PUBLISH" | "SHARE" | "RETRY">;
};
```

对象详情：

```ts
type MyObjectDetail = MyObjectListItem & {
  chatHref: string | null;
  addSourcesHref: string | null;
  shareHref: string | null;
  editableFields: Array<"displayName" | "intro">;
  userMessage: string | null;
};
```

普通用户接口不返回：

- `qualitySummary`
- `coverageScore`
- `styleScore`
- `publishGate.reasons`
- `toolRuns`
- `trace`
- raw source bucket score

内部失败原因必须翻译成用户语言。

## 4. 模型职责原则

蒸馏后端要从“代码线性流程”升级为“模型选择工具，代码执行工具”。

### 4.1 代码职责

代码只负责：

- tool function schema
- 参数校验
- 权限校验
- DB 读写
- 搜索服务调用
- 文件/资料清洗的确定性前置处理
- 超时、重试、幂等
- trace 记录
- 确定性状态机
- tool 前置条件
- 最终状态落库

代码不负责把蒸馏智能逻辑写成大量 if/else。

### 4.2 模型职责

模型负责：

- 判断下一步该调用哪个工具。
- 根据工具结果决定是否继续搜资料、清洗、抽证据、生成 profile。
- 综合资料生成对象 prompt/profile。
- 判断是否资料不足并给出内部结构化理由。

模型给出的理由进入内部 trace；用户只看到简短可行动文案。

### 4.3 模型能力分工

V1 推荐分工：

- Minimax：tool-calling planner/router。使用前必须有 adapter contract test 或 capability probe，确认返回稳定 tool calls。
- Kimi：资料搜索和长资料抽取候选。只负责资料层，不负责最终 persona 合成。
- DeepSeek reasoner：最终 profile/prompt 合成和一致性检查。只在证据和覆盖条件满足后调用。
- 确定性 TypeScript：权限、状态机、落库、数据裁剪、风险硬规则、重试、幂等、非法 tool 顺序拒绝。

如果某一步模型能力不匹配，必须调整分工，而不是强行复用同一个模型。

### 4.4 Tool Runtime 硬边界

模型不能随意决定终态。代码必须维护确定性状态机：

```text
START
  -> RISK_CHECKED
  -> SOURCES_COLLECTED
  -> SOURCES_CLEANED
  -> EVIDENCE_EXTRACTED
  -> COVERAGE_SCORED
  -> PROFILE_GENERATED
  -> PROFILE_VALIDATED
  -> PERSISTED | NEEDS_SOURCES | FAILED
```

关键前置条件：

- `persist_persona_candidate` 只能在 `PROFILE_VALIDATED` 后执行。
- `generate_persona_profile` 只能在 `COVERAGE_SCORED` 后执行。
- `extract_evidence` 只能在 `SOURCES_CLEANED` 后执行。
- `mark_job_needs_sources` 必须带缺失原因和用户可理解文案。
- 非法 tool 顺序必须拒绝、写 trace，并让 planner 重新选择；超过次数后 `mark_job_failed`。
- 模型不能直接写 DB，只能调用受控 persist/mark 工具。

## 5. 顺序 Task

### Task 1: Stable Object Identity, Contracts, And Migration Foundation

**目标：** 建立稳定 `objectId` 语义和用户对象 contract，避免 job/version/persona 多身份混乱。

**文件范围：**

- Modify/Create: `packages/contracts/src/persona-inventory.ts`
- Create if needed: `packages/contracts/src/my-objects.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/api-client/src/personae.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/bootstrap.ts`
- Test: `apps/api/src/persona-distill-v2.test.ts`

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，重点确认 `objectId` 稳定身份规则。
- [ ] 写失败测试：创建中 job、candidate、private、public 都返回稳定 `objectId`。
- [ ] 写失败测试：inventory contract 不包含 `qualitySummary`，包含 `status`、`availableActions`、`objectId`。
- [ ] 增加 `owned_persona_objects` schema 和 bootstrap/backfill 逻辑。
- [ ] 更新 contracts 和 api-client。
- [ ] 跑 `pnpm --filter @hall-of-fame/api test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/api typecheck`。
- [ ] 跑 `pnpm --filter @hall-of-fame/client typecheck`。
- [ ] subagent review 实现和测试。

**验收：**

- `objectId` 在创建、确认、公开、删除前后稳定。
- 旧 job、旧 candidate、旧 private/public 数据能 backfill 到对象表。
- 普通用户 contract 不要求内部质量字段。

### Task 2: Backend Inventory Mapping

**目标：** 后端 `GET /v1/me/persona-inventory` 返回用户对象语义，不暴露内部指标。

**文件范围：**

- Modify: `apps/api/src/db/repositories/persona-distill-repository.ts`
- Modify: `apps/api/src/routes/me.ts`
- Test: `apps/api/src/persona-distill-v2.test.ts`

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，确认状态映射符合业务流。
- [ ] 写失败测试：candidate/private/public/job failed/needs sources 映射到用户对象状态。
- [ ] 写失败测试：旧 QUEUED/RUNNING/FAILED/CANDIDATE 数据在新 inventory 下仍可恢复。
- [ ] 修改 repository mapping。
- [ ] 确认 route parse 通过新 contract。
- [ ] 跑 `pnpm --filter @hall-of-fame/api test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/api typecheck`。
- [ ] subagent review 实现和测试。

**验收：**

- 未保存 candidate 仍能在我的对象找回。
- private/public 状态正确。
- job 失败和资料不足能进入可恢复状态。
- 普通用户接口不返回内部质量说明。

### Task 3: Object Detail And Management APIs

**目标：** 支撑 `我的对象 -> 对象详情` 的聊天、编辑、确认、补资料、删除、分享动作。

**文件范围：**

- Modify/Create: `packages/contracts/src/my-objects.ts`
- Modify/Create: `apps/api/src/routes/my-objects.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/db/repositories/persona-distill-repository.ts`
- Modify: `apps/api/src/db/repositories/dynamic-persona-repository.ts`
- Test: `apps/api/src/persona-distill-v2.test.ts`

**接口：**

```http
GET /v1/me/objects/:objectId
PATCH /v1/me/objects/:objectId
DELETE /v1/me/objects/:objectId
POST /v1/me/objects/:objectId/confirm
POST /v1/me/objects/:objectId/publish
```

补资料 V1 可以继续跳转现有 create flow：

```http
GET /create?objectId=...&jobId=...&mode=addSources
```

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，确认不会引入重复对象体系。
- [ ] 写失败测试：owner 能获取对象详情，非 owner 不能获取。
- [ ] 写失败测试：`confirm` 将 `PENDING_CONFIRM` 转为 `READY`，文案和 API 不暴露 publish。
- [ ] 写失败测试：编辑 displayName/intro 后列表和详情一致。
- [ ] 写失败测试：删除后不出现在 inventory；历史聊天可显示旧消息但不能继续新聊。
- [ ] 写失败测试：公开失败返回用户语言，不返回 `publishGate.reasons`。
- [ ] 实现 API 和 repository。
- [ ] 跑 `pnpm --filter @hall-of-fame/api test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/api typecheck`。
- [ ] subagent review 实现和测试。

**验收：**

- 对象详情成为管理动作唯一入口。
- 删除是 owner-only。
- 编辑不影响内置对象。
- `PENDING_CONFIRM -> READY` 有明确确认闭环。
- 补资料仍复用已有 create/job 流程。

### Task 4: Profile And My Objects Frontend

**目标：** `/profile` 简化为个人入口，新增 `/profile/objects` 和对象详情页。

**文件范围：**

- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`
- Modify: `apps/client/src/chat-behavior.test.ts`

**页面要求：**

```text
/profile
  我的
  我的对象
  聊天记录

/profile/objects
  对象列表
  对象卡片：名称 / 一句简介 / 用户状态 / 主操作

/profile/objects/:objectId
  对象详情
  聊天 / 编辑 / 确认使用 / 补资料 / 删除 / 分享
```

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，确认符合“只展示有用信息”。
- [ ] 写失败测试：`/profile` 不出现对象质量、coverage、style、reasons。
- [ ] 写失败测试：对象列表只展示用户状态和主操作。
- [ ] 写失败测试：对象详情展示聊天/编辑/确认使用/补资料/删除。
- [ ] 实现页面和 route。
- [ ] 跑 `pnpm --filter @hall-of-fame/client test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/client typecheck`。
- [ ] subagent review 实现和测试。

**验收：**

- `/profile` 不再是复杂对象卡片堆叠。
- `我的对象` 是用户自建对象唯一管理入口。
- 用户看不到内部评分。

### Task 5: Unified Pure Chat Surface

**目标：** 内置对象、自建对象、分享对象进入同一类纯聊天 UI。

**文件范围：**

- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/dev-h5.test.ts`
- Modify: `apps/client/src/chat-behavior.test.ts`
- Possibly modify: `apps/api/src/routes/chats.ts`

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，确认聊天页不混入管理操作。
- [ ] 写失败测试：自建对象聊天页不包含推荐问题、示例回答、质量、发布、补资料、阶段条。
- [ ] 写失败测试：直接访问 `/preview/:id` 不展示内部指标，owner 重定向到对象详情，非 owner 进入可用纯聊天或安全失败页。
- [ ] 抽取或复用统一 chat body。
- [ ] 增加 `/profile/objects/:objectId/chat` 自建对象聊天路由。
- [ ] 保持 `/history` 恢复会话时仍进入纯聊天。
- [ ] 跑 `pnpm --filter @hall-of-fame/client test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/client typecheck`。
- [ ] subagent review 实现和测试。

**验收：**

- 所有聊天页只保留聊天必要信息。
- `/preview` 不再作为普通用户复杂聊天页。
- 历史会话不会把用户带回管理页。

### Task 6: Create Flow Completion Redirect

**目标：** 创建完成后进入对象详情或我的对象，而不是复杂 preview。

**文件范围：**

- Modify: `apps/client/src/h5-app.ts`
- Modify: `apps/client/src/chat-behavior.test.ts`
- Modify: `packages/contracts/src/persona-distill.ts`
- Modify: `apps/api/src/routes/persona-distill.ts`
- Modify if needed: `apps/api/src/db/repositories/persona-distill-repository.ts`

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划。
- [ ] subagent review 计划，确认创建完成的用户路径清晰。
- [ ] 写失败测试：job success response 包含 `objectId` 和 `objectHref`。
- [ ] 写失败测试：前端 job success 后跳 `/profile/objects/:objectId`。
- [ ] 修改 job 创建和完成 response。
- [ ] 修改前端轮询完成跳转。
- [ ] 保留 `/preview/:id` 兼容旧链接，但普通用户不再看到内部管理信息。
- [ ] 跑 client/api 相关测试和 typecheck。
- [ ] subagent review 实现和测试。

**验收：**

- 创建完成后用户能马上找到对象。
- 离开页面后从我的对象可恢复。
- preview 管理信息不再打断用户体验。

### Task 7: Distill Tool Runtime Design, State Machine, And Schema

**目标：** 设计并落库 tool calling runtime 的协议、状态、trace 和确定性状态机，不立即替换全部蒸馏逻辑。

**文件范围：**

- Create: `packages/contracts/src/distill-tools.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/bootstrap.ts`
- Create: `apps/worker/src/jobs/persona-distill/tool-runtime/`
- Test: worker/api typecheck and focused tests

**工具协议：**

```ts
type DistillToolName =
  | "check_distill_intent_risk"
  | "search_sources"
  | "clean_sources"
  | "extract_evidence"
  | "score_source_coverage"
  | "generate_persona_profile"
  | "validate_persona_profile"
  | "persist_persona_candidate"
  | "mark_job_needs_sources"
  | "mark_job_failed";
```

**数据库：**

新增 trace 表：

```text
persona_distill_tool_runs
```

最小字段：

```text
id
job_id
seq
tool_name
runtime_state_before
runtime_state_after
input_json
output_json
status
error_message
started_at
finished_at
```

**模型适配审查：**

- Minimax 是否可作为 function calling planner。
- Kimi 是否只负责搜索/长资料抽取，不负责最终 persona 合成。
- DeepSeek reasoner 是否只负责最终强推理合成和一致性检查。
- 是否有 capability probe 或 adapter contract test。
- 不能让模型直接写库。

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划，必须包含模型能力选择说明。
- [ ] subagent review 计划，重点审查模型能力、状态机和技术边界。
- [ ] 写失败测试：tool schema 能 parse 合法调用，拒绝非法工具名和非法参数。
- [ ] 写失败测试：非法 tool 顺序被拒绝并写 trace。
- [ ] 写失败测试：`persist_persona_candidate` 在 `PROFILE_VALIDATED` 前不能执行。
- [ ] 写失败测试：Minimax adapter 无 tool call 时返回可恢复错误。
- [ ] 增加 `persona_distill_tool_runs` 表和 bootstrap/backfill 安全逻辑。
- [ ] 实现 tool registry 空壳、state machine 和 deterministic tool executor 边界。
- [ ] 跑 worker/api typecheck 和 focused tests。
- [ ] subagent review 实现和测试。

**验收：**

- 有明确 tool schema。
- 有 tool run trace。
- 有确定性状态机和 tool 前置条件。
- 模型只能通过合法 tool 调用影响状态。
- 不替换现有 worker 主流程，先作为可接入底座存在。

### Task 8: Distill Worker Tool-Calling Refactor

**目标：** 将现有一键蒸馏 worker 改为模型驱动 tool calling flow，同时保持现有用户路径可用。

**文件范围：**

- Modify: `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`
- Modify/Create: `apps/worker/src/jobs/persona-distill/tool-runtime/*`
- Modify: `apps/api/src/db/repositories/persona-distill-repository.ts`
- Modify: `packages/prompt-kit/src/distill/*`
- Test: `apps/api/src/persona-distill-v2.test.ts`, worker focused tests

**目标 flow：**

```text
claim job
  -> create/load owned object
  -> call planner model with available tools and current runtime state
  -> validate requested tool against state machine
  -> execute requested tool
  -> append tool result
  -> repeat until terminal state:
       PERSISTED
       NEEDS_SOURCES
       FAILED
```

**安全边界：**

- 每个 job 最大 tool call 次数。
- 每个 tool 有超时。
- 每次 tool run 幂等记录。
- 大文本工具输出必须裁剪成摘要。
- 风险硬规则由确定性代码兜底。
- fallback profile 只能作为失败恢复，不能静默伪装成高质量结果。
- planner 请求非法 tool 顺序时拒绝执行，并给模型一次纠正机会；多次非法后失败。
- 旧 job/旧 candidate 必须仍可恢复到对象详情。

**详细步骤：**

- [ ] 主 agent 输出本 task 详细落地计划，必须拆出模型调用、tool 执行、状态机、终态落库、fallback 五部分。
- [ ] subagent review 计划，重点审查是否会破坏现有创建闭环。
- [ ] 写失败测试：tool loop 超限会 mark failed。
- [ ] 写失败测试：非法 tool 顺序不会 persist candidate。
- [ ] 写失败测试：needs sources 会进入可恢复状态。
- [ ] 写失败测试：persist candidate 后 inventory 和对象详情可见。
- [ ] 写失败测试：旧 QUEUED/RUNNING/CANDIDATE 数据可恢复。
- [ ] 实现 planner adapter。
- [ ] 实现 tool loop。
- [ ] 接入现有 Kimi/DeepSeek 能力。
- [ ] 保留 deterministic fallback，但用户状态必须表现为可恢复/待确认。
- [ ] 跑 api/worker/client 相关测试。
- [ ] subagent review 实现和测试。

**验收：**

- 创建流程仍可完成。
- worker 不再是纯线性硬编码流程。
- tool trace 可内部排查。
- 用户侧仍只看到简单状态。
- 模型分工与角色能力匹配。

### Task 9: Full Integration QA

**目标：** 做完整前后端联调，确保用户路径闭环。

**文件范围：**

- Tests and fixes across touched files.

**联调路径：**

```text
/create 输入对象
  -> 确认资料
  -> 生成
  -> /profile/objects/:objectId
  -> 确认使用
  -> 聊天
  -> /history 恢复纯聊天
  -> /profile/objects 补资料
  -> /profile/objects 删除
```

**异常路径：**

- 非 owner 访问对象详情。
- 删除后从历史聊天进入。
- 直接访问旧 `/preview/:id`。
- 创建失败后重试。
- 资料不足后补资料。
- 公开失败后仍可自己使用。

**详细步骤：**

- [ ] 主 agent 输出 QA 计划。
- [ ] subagent review QA 计划。
- [ ] 跑 `pnpm --filter @hall-of-fame/client test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/api test`。
- [ ] 跑 `pnpm --filter @hall-of-fame/client typecheck`。
- [ ] 跑 `pnpm --filter @hall-of-fame/api typecheck`。
- [ ] 跑 `pnpm --filter @hall-of-fame/worker typecheck`。
- [ ] 启动本地服务，浏览器验证 create/profile/objects/detail/chat/history/preview compatibility。
- [ ] subagent 做最终业务和技术 review。

**验收：**

- 用户能完成创建、找到对象、确认使用、聊天、补资料、删除。
- 用户页面不展示内部系统信息。
- 内置对象聊天和自建对象聊天体验一致。
- 第 7/8 步没有破坏现有 API 兼容路径。

## 6. 明确不做

V1 不做：

- admin review 页面。
- 用户可见 tool trace。
- 用户可见模型选择。
- 首页混入用户自建对象。
- 聊天页内管理对象。
- 自动精选用户公开对象。

## 7. 风险和处理

- 风险：`objectId` 如果不稳定，会导致创建、确认、补资料、删除无法闭环。处理：Task 1 必须先落 `owned_persona_objects` 或等价稳定身份表。
- 风险：`/preview` 已经承担太多职责。处理：Task 5/6 明确普通用户访问 preview 时重定向或隐藏内部指标。
- 风险：inventory contract 改动影响前后端。处理：Task 1 同步更新 contract、api-client 和 typecheck。
- 风险：删除对象影响历史聊天。处理：V1 删除后隐藏对象管理入口，历史可显示旧消息但不能继续新聊。
- 风险：第 8 步 worker 重构范围大。处理：第 7 步先做 tool runtime schema、trace 和状态机，第 8 步再替换主流程。
- 风险：模型 function call 不稳定。处理：adapter contract test、capability probe、schema 校验、调用次数上限、非法顺序拒绝、失败终态和 fallback。
