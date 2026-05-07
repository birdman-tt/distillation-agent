# Distill Worker Tool-Calling Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把一键蒸馏 worker 从线性硬编码流程改为受状态机约束的 tool-calling runtime，同时保持现有创建、补资料、我的对象、聊天入口全部可用。

**Architecture:** MiniMax 只做 planner/router，返回下一步 tool call；TypeScript 负责 tool schema、状态机、权限、幂等、DB 事务、trace 和终态落库。Kimi 继续只在资料发现阶段使用，DeepSeek reasoner 只在 `generate_persona_profile` 工具里做最终 profile/prompt 合成；本任务保留 deterministic planner fallback 用于测试和未配置模型环境，但生产可通过 env 显式切到 MiniMax planner。

**Tech Stack:** TypeScript, Fastify worker, PostgreSQL/Supabase, `postgres`, Zod contracts, MiniMax chat completions function calling, DeepSeek structured JSON, existing H5/API contracts.

---

## 1. 当前代码事实

当前 worker 主流程在：

```text
apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts
```

当前是线性流程：

```text
claimJobs
  -> loadSelectedCandidates
  -> createApprovedSourceSnapshot
  -> runDistillJob
  -> getPreviewGateMissingReasons
  -> persistCandidateVersion | NEEDS_MORE_SOURCES | FAILED
```

Task 5 已完成的底座在：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/
```

已有能力：

- `distillToolCallSchema` / `distillToolResultSchema`
- `DistillRuntimeState`
- `getNextRuntimeStateForTool`
- `executeDistillToolStep`
- `persona_distill_tool_runs`
- trace sanitizer 和 JSONB store

本任务必须基于这些能力接入主流程，不重新发明第二套状态机或 trace 表。

## 2. 业务要求

必须满足：

- `/create` 创建流程仍然可完成。
- 创建成功后仍返回稳定 `objectId/objectHref`。
- `NEEDS_MORE_SOURCES` 仍可从 `我的对象` 和 `create?mode=addSources` 恢复。
- 补资料重新蒸馏仍复用同一个 `objectId`，旧 candidate 被替换。
- 自建对象的对象详情、确认、聊天、删除不被破坏。
- 普通用户 API 和 UI 不展示 tool trace、模型名称、状态机内部状态、质量分、coverage、prompt。
- worker 内部必须写 `persona_distill_tool_runs`，方便排查。

不做：

- 不改 `/create` 页面设计。
- 不把 tool trace 暴露给普通用户。
- 不新增 admin review 页面。
- 不把 Kimi 放到 worker 主流程里重新做 source discovery。
- 不让模型直接写 DB。

## 3. 模型角色能力审查

### 3.1 MiniMax planner/router

适合做：

- 根据当前 runtime state 和工具结果选择下一步 tool。
- 通过 function calling 返回结构化 tool call。
- 在非法 tool 被拒绝后，根据错误结果重新选择。

不适合做：

- 决定最终 DB 状态。
- 绕过风险、质量、权限校验。
- 直接生成 persona profile。

代码兜底：

- `distillToolCallSchema` parse。
- `getNextRuntimeStateForTool` 决定唯一合法下一状态。
- `executeDistillToolStep` 不信任 handler/model 的 `stateAfter`。
- 非法 tool 顺序写 `REJECTED` trace；超过纠正次数后 `mark_job_failed`。

### 3.2 Kimi source layer

适合做：

- `/v1/persona-distill-source-discovery` 阶段搜索公开资料。
- 资料候选摘要、URL、snippet 生成。

本任务不把 Kimi 放进 worker tool loop，因为用户确认资料已经发生在 job 创建前。worker 的 `search_sources` 工具只读取用户已选择的 source candidates / extra sources。

### 3.3 DeepSeek reasoner synthesis

适合做：

- 在 `generate_persona_profile` 工具里基于已审核资料生成 `profile/preview/scores`。
- 做强推理合成和风格一致性。

不适合做：

- 决定资料是否足够。
- 决定能否落库。
- 决定是否需要补资料。

代码兜底：

- `distillOutputSchema` parse。
- `validate_persona_profile` 工具重新计算 quality gate。
- `persist_persona_candidate` 只能从 `PROFILE_VALIDATED` 执行。

### 3.4 TypeScript deterministic layer

必须由代码做：

- 风险硬规则。
- source risk flags 过滤。
- coverage gate。
- DB transaction。
- source snapshot 和 evidence span 落库。
- candidate version persist。
- object 状态同步。
- tool run trace。
- retry / max tool call / timeout。

## 4. 目标 Flow

```text
claim job
  -> runtimeState = START
  -> planner 选择 check_distill_intent_risk
  -> executeDistillToolStep 写 trace，并由状态机推进到 RISK_CHECKED
  -> planner 选择 search_sources
  -> execute tool 读取用户已选资料
  -> planner 选择 clean_sources
  -> execute tool 过滤风险资料并生成 approved source snapshot
  -> planner 选择 extract_evidence
  -> execute tool 确认证据 span 已可用
  -> planner 选择 score_source_coverage
  -> execute tool 计算资料覆盖是否足够
  -> if coverage 不足:
       planner 选择 mark_job_needs_sources
       terminal NEEDS_SOURCES
     else:
       planner 选择 generate_persona_profile
       DeepSeek reasoner 或 deterministic fallback 生成 profile
       planner 选择 validate_persona_profile
       if validation 不足:
         planner 选择 mark_job_needs_sources
         terminal NEEDS_SOURCES
       else:
         planner 选择 persist_persona_candidate
         terminal PERSISTED
```

失败路径：

```text
planner 返回非法 tool
  -> executeDistillToolStep 写 REJECTED
  -> planner 最多再纠正 1 次
  -> 仍失败则 mark_job_failed

tool handler 抛错
  -> executeDistillToolStep 写 FAILED
  -> mark_job_failed

tool call 次数超过上限
  -> mark_job_failed
```

## 5. 文件范围

Create:

- `apps/worker/src/jobs/persona-distill/tool-runtime/distill-planner.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/distill-planner.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-loop.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-loop.test.ts`

Modify:

- `apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/index.ts`
- `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`
- `apps/api/src/persona-distill-v2.test.ts`

Review only unless typecheck requires:

- `packages/contracts/src/distill-tools.ts`
- `apps/api/src/db/repositories/persona-distill-repository.ts`

## 6. State Machine 修正

当前状态机不允许 `PROFILE_VALIDATED -> mark_job_needs_sources`。这会导致 profile 生成后质量校验不通过时无法进入 `NEEDS_SOURCES`。

必须新增合法转移：

```text
PROFILE_VALIDATED -> mark_job_needs_sources -> NEEDS_SOURCES
```

原因：

- `score_source_coverage` 只能判断资料数量、桶覆盖、风险资料。
- `validate_persona_profile` 才能判断 DeepSeek 输出后的 `coverageScore/groundingScore/styleScore/riskScore`。
- 如果最终 profile 质量不足，用户应进入“需要补资料”，而不是失败。

新增测试：

```text
PROFILE_VALIDATED allows mark_job_needs_sources
```

## 7. Planner 设计

### 7.1 Planner interface

新增：

```ts
type DistillPlannerInput = {
  jobId: string;
  intentId: string;
  discoveryId: string;
  actorUserId: string;
  personaId: string;
  runtimeState: DistillRuntimeState;
  normalizedName: string;
  displayName: string;
  entityType: string;
  riskDecision: "ALLOW" | "NEED_REVIEW" | "BLOCK";
  riskReasons: string[];
  selectedSourceCandidateIds: string[];
  selectedExtraSourceIds: string[];
  toolResults: Array<{
    seq: number;
    toolName: DistillToolName;
    ok: boolean;
    summary: string;
    data: Record<string, unknown>;
  }>;
  memory: DistillToolMemorySnapshot;
};

type DistillPlanner = {
  nextToolCall(input: DistillPlannerInput): Promise<DistillToolCall>;
};
```

这些字段必须来自可信 DB job/context，不能由模型猜。为此 `claimJobs` 的 `JobRow` 必须扩展并选择：

```ts
type JobRow = {
  id: string;
  createdByUserId: string;
  intentId: string;
  discoveryId: string;
  personaId: string;
  query: string;
  normalizedName: string;
  entityType: "REAL_PERSON" | "FICTIONAL_CHARACTER" | "UNKNOWN";
  riskDecision: "ALLOW" | "NEED_REVIEW" | "BLOCK";
  riskReasons: string[];
  selectedSourceCandidateIds: unknown;
  selectedExtraSourceIds: unknown;
  attemptCount: number;
};
```

`riskReasons` 不在 `persona_distill_jobs` 表里，必须从 `persona_distill_intents.risk_reasons` join/select：

```sql
select
  j.id,
  j.created_by_user_id as "createdByUserId",
  j.intent_id as "intentId",
  j.discovery_id as "discoveryId",
  j.persona_id as "personaId",
  j.query,
  j.normalized_name as "normalizedName",
  j.entity_type as "entityType",
  j.risk_decision as "riskDecision",
  i.risk_reasons as "riskReasons",
  j.selected_source_candidate_ids as "selectedSourceCandidateIds",
  j.selected_extra_source_ids as "selectedExtraSourceIds",
  j.attempt_count as "attemptCount"
from persona_distill_jobs j
join persona_distill_intents i on i.id = j.intent_id
where j.status = 'QUEUED'
```

新增测试要求：

- deterministic planner 从真实 `JobRow` 构造 `check_distill_intent_risk`，并通过 `distillToolCallSchema`。
- deterministic planner 从真实 `JobRow` 构造 `search_sources`，并通过 `distillToolCallSchema`。
- handler 不能忽略 tool input；handler 必须 parse input 并校验 input 与 job context 一致。

### 7.2 Deterministic fallback planner

用于测试、本地未配置 MiniMax、模型异常 fallback。它仍通过 tool call 执行，不直接改业务状态。

规则：

```text
START -> check_distill_intent_risk
RISK_CHECKED -> search_sources
SOURCES_COLLECTED -> clean_sources
SOURCES_CLEANED -> extract_evidence
EVIDENCE_EXTRACTED -> score_source_coverage
COVERAGE_SCORED:
  coverageMissingRequirements.length > 0 -> mark_job_needs_sources
  else -> generate_persona_profile
PROFILE_GENERATED -> validate_persona_profile
PROFILE_VALIDATED:
  validationMissingRequirements.length > 0 -> mark_job_needs_sources
  else -> persist_persona_candidate
```

### 7.3 MiniMax planner

新增 worker-local MiniMax adapter，不从 `apps/api` 跨 rootDir 导入。

环境变量：

```text
PERSONA_DISTILL_PLANNER_PROVIDER=deterministic|minimax
MINIMAX_API_KEY
MINIMAX_BASE_URL
MINIMAX_PLANNER_MODEL
PERSONA_DISTILL_MAX_TOOL_CALLS
```

默认：

- 未显式设置 `PERSONA_DISTILL_PLANNER_PROVIDER=minimax` 时用 deterministic planner，避免本地测试误打真实模型。
- 生产要启用模型 planner 时显式设置 `PERSONA_DISTILL_PLANNER_PROVIDER=minimax`。

MiniMax adapter 要求：

- 请求 `/chat/completions`。
- 传入 function tools。
- 如果没有 `tool_calls`，抛 `DistillPlannerNoToolCallError`。
- 只取第一条 tool call。
- tool name 和 arguments 必须经 `distillToolCallSchema` parse。
- parse 失败不执行业务 handler，但必须写内部 trace。

非法 planner 输出 trace 策略：

- 新增 `recordRejectedDistillPlannerCall`，复用 `persona_distill_tool_runs` 表写一条 `REJECTED` 记录。
- `tool_name` 写模型返回的原始 tool name；如果为空则写 `planner_invalid_tool_call`。
- `input_json` 写 sanitizer 后的 `{ rawToolName, rawArguments, runtimeState }`。
- `output_json` 写 sanitizer 后的 `{ rejected: true, reason }`。
- `runtime_state_after` 为 `null`。
- 该记录只用于内部排查，不进入普通用户 API。
- 记录完成后，tool loop 使用合法 `mark_job_failed` 终止；如果失败工具本身也不可执行，则直接写 job failed。

测试：

- MiniMax 返回合法 tool call 时能 parse。
- MiniMax 没有 tool call 时返回可恢复错误。
- MiniMax 返回非法 tool name 时写 `REJECTED` trace，不执行业务 handler，并最终进入 `FAILED`。

## 8. Tool Memory 与 Handler 设计

tool handler 不把中间大文本暴露给用户，只在 worker 内部维护 memory，trace 入库前由 sanitizer 处理。

```ts
type DistillToolMemory = {
  candidates: CandidateRow[];
  usableCandidates: CandidateRow[];
  approvedSources: Array<{
    sourceId: string;
    documentId: string;
    sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
    title: string;
    summary: string;
  }>;
  coverageMissingRequirements: string[];
  validationMissingRequirements: string[];
  output: Awaited<ReturnType<typeof runDistillJob>> | null;
  persistedVersionId: string | null;
};
```

每个工具职责：

- `check_distill_intent_risk`: 只确认 job 的 `riskDecision` 是 `ALLOW`，否则要求 planner 调 `mark_job_failed`。
- `search_sources`: 读取用户已选择资料，不联网搜索。
- `clean_sources`: 过滤 `riskFlags`，生成 `persona_sources/source_documents/evidence_spans` snapshot。
- `extract_evidence`: 汇总已生成 evidence spans 数，不做模型抽取。
- `score_source_coverage`: 计算 source count、bucket count、primary/secondary count，写 `coverageMissingRequirements`。
- `generate_persona_profile`: 调 `runDistillJob`，DeepSeek 可用则用 DeepSeek，不可用走 deterministic fallback。
- `validate_persona_profile`: 复用 `getPreviewGateMissingReasons`，写 `validationMissingRequirements`。
- `persist_persona_candidate`: 复用 `persistCandidateVersion`，写 job `SUCCEEDED` 和 object `PENDING_CONFIRM`。
- `mark_job_needs_sources`: 写 job `NEEDS_MORE_SOURCES` 和 object `NEEDS_SOURCES`。
- `mark_job_failed`: 写 job `FAILED` 和 object `FAILED`。

handler 输入校验：

- `check_distill_intent_risk.input.intentId` 必须等于 `job.intentId`。
- `check_distill_intent_risk.input.riskDecision` 必须等于 `job.riskDecision`。
- `search_sources.input.discoveryId` 必须等于 `job.discoveryId`。
- `search_sources.input.selectedSourceCandidateIds` 必须等于 job 中持久化的 selected ids。
- `search_sources.input.selectedExtraSourceIds` 必须等于 job 中持久化的 selected extra ids。
- `persist_persona_candidate.input.idempotencyKey` 必须包含当前 `job.id`，避免跨 job 复用。
- 任一不匹配都抛错，由 executor 写 `FAILED` trace，再进入 `mark_job_failed`。

## 9. Tool Loop 设计

新增 `tool-loop.ts`：

```text
runDistillToolLoop(job, handlers, planner, options)
  -> state START
  -> seq 1..maxToolCalls
  -> planner.nextToolCall(...)
  -> executeDistillToolStep(...)
  -> append result summary
  -> update state
  -> if terminal return mapped run result
  -> if planner/tool error:
       record rejection/failure
       call mark_job_failed through executor when possible
```

必须保证：

- 所有 DB 状态变化通过 tool handler。
- 所有 tool 调用通过 `executeDistillToolStep`。
- 非法 persist 不会执行 handler。
- 超限会进入 `FAILED`。
- `NEEDS_SOURCES` 是可恢复终态，不是失败。

## 10. Run Job 集成

`runOneJob` 改为：

```text
try runDistillToolLoop(job)
catch -> mark failed
return succeeded / needs_more_sources / failed
```

`claimJobs` 保持不变，避免改动调度语义。

`runDuePersonaDistillJobs` 返回结构保持：

```ts
{
  claimed,
  succeeded,
  failed,
  needsMoreSources
}
```

## 11. 测试计划

### 11.1 Focused unit tests

Run:

```bash
node --import tsx --test \
  apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/distill-planner.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-loop.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts
```

覆盖：

- `PROFILE_VALIDATED -> mark_job_needs_sources` 合法。
- deterministic planner happy path。
- deterministic planner 使用真实 job context 构造前两步 tool call，且 schema parse 通过。
- deterministic planner 在 coverage/validation 不足时选择 `mark_job_needs_sources`。
- MiniMax no tool call 返回可恢复错误。
- MiniMax invalid tool name/arguments 有内部 `REJECTED` trace，且不会执行 handler。
- tool loop 超限会 mark failed。
- 非法 tool 顺序不会 persist candidate。
- needs sources 会成为 terminal `NEEDS_SOURCES`。

### 11.2 API/worker integration tests

Modify `apps/api/src/persona-distill-v2.test.ts`：

- 创建成功后 `persona_distill_tool_runs` 至少包含：
  - `check_distill_intent_risk`
  - `search_sources`
  - `clean_sources`
  - `extract_evidence`
  - `score_source_coverage`
  - `generate_persona_profile`
  - `validate_persona_profile`
  - `persist_persona_candidate`
- 资料不足路径进入 `NEEDS_MORE_SOURCES`，并写 `mark_job_needs_sources` trace。
- 补资料 retry 后仍复用同一 `objectId`。
- `GET /v1/persona-distill-jobs/:jobId` 不包含 `toolRuns`、`plannerModel`、`modelProvider`、`runtimeState`。
- `GET /v1/me/persona-inventory` 不包含 `toolRuns`、`qualitySummary`、`coverageScore`、`styleScore`、`publishGate`、`runtimeState`。
- `GET /v1/me/objects/:objectId` 不包含 `toolRuns`、`plannerModel`、`modelProvider`、`runtimeState`、`coverageScore`、`styleScore`、`publishGate`。
- `GET /v1/persona-versions/:versionId` 不包含 `toolRuns`、`sourceDistillJobId`、`coverageScore`、`styleScore`、`publishGate`。

Focused run:

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "one-click distill job produces" src/persona-distill-v2.test.ts
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "creating the same active distill job is idempotent" src/persona-distill-v2.test.ts
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "adding sources to a completed job" src/persona-distill-v2.test.ts
```

### 11.3 Typecheck

Run:

```bash
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/worker typecheck
pnpm --filter @hall-of-fame/api typecheck
```

## 12. 验收标准

业务验收：

- 用户创建对象仍能完成。
- 完成后对象仍出现在 `我的对象`。
- 补资料重蒸不换 `objectId`。
- 资料不足是可恢复状态。
- 普通用户仍看不到内部 trace/模型/评分。

技术验收：

- worker 主流程通过 tool loop 执行，而不是直接线性调用所有步骤。
- `persona_distill_tool_runs` 有每步 trace。
- 状态机阻止非法 persist。
- handler/model 返回的 `stateAfter` 不被信任。
- MiniMax planner 可接入且有 contract test。
- DeepSeek 只在 `generate_persona_profile` 工具里调用。
- Kimi 不进入 worker 主循环。

## 13. 实施顺序

- [ ] Step 1: 更新状态机，允许 `PROFILE_VALIDATED -> mark_job_needs_sources`，补测试。
- [ ] Step 2: 新增 planner interface、deterministic planner、MiniMax planner adapter 和 tests。
- [ ] Step 3: 新增 tool loop 和 focused tests。
- [ ] Step 4: 在 `run-persona-distill-jobs.ts` 构造真实 handlers，复用现有 helper。
- [ ] Step 5: 用 tool loop 替换 `runOneJob` 主体，保持 `runDuePersonaDistillJobs` response 不变。
- [ ] Step 6: 补 API integration trace 断言。
- [ ] Step 7: 跑 focused tests、typecheck、关键 API tests。
- [ ] Step 8: 交给 review subagent 做业务和技术验收。

## 14. 风险与处理

- 风险：planner 默认走真实 MiniMax 会让测试不稳定。处理：默认 deterministic，只有 `PERSONA_DISTILL_PLANNER_PROVIDER=minimax` 才打 MiniMax。
- 风险：状态机原来不支持 profile 校验后补资料。处理：本任务第一步修正状态机并补测试。
- 风险：tool handler 直接复用旧 helper 时可能仍显得线性。处理：旧 helper 只能作为 tool function 内部实现，主流程必须由 planner + executor 驱动。
- 风险：trace 写入大文本。处理：继续使用 Task 5 的 sanitizer，不在用户 API 暴露 trace。
- 风险：DeepSeek 未配置时本地测试失败。处理：保留 `runDistillJob` 的 deterministic fallback，但 trace summary 必须标明工具完成，不对用户展示 fallback 细节。
