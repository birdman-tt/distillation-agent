# Distill Tool Runtime State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为一键蒸馏建立 tool function 协议、确定性状态机和 tool run trace，先形成可接入底座，不立即替换现有 worker 主流程。

**Architecture:** 把“模型决定下一步”和“代码执行工具”拆开。`packages/contracts` 定义 tool call/result/schema；`apps/worker` 提供状态机、tool registry、trace writer 和本地 runtime 骨架；DB 新增 `persona_distill_tool_runs` 记录每次工具输入输出和状态变化。当前 `runDuePersonaDistillJobs` 仍保持原线性实现，下一任务再接入 tool loop。

**Tech Stack:** TypeScript, Zod, PostgreSQL/Supabase, Fastify worker, `postgres`, existing MiniMax/Kimi/DeepSeek adapters as future model providers.

---

## 1. 业务边界

本任务是总方案里后端重构的第 7 步，目标是先把“可控 tool runtime”落地。

必须满足：

- 有统一 tool name、tool call、tool result、runtime state schema。
- 有确定性状态机，模型不能跳过必要步骤。
- 有 `persona_distill_tool_runs` trace 表，内部可追踪每一步工具调用。
- 有 tool registry 骨架，后续可接 MiniMax planner。
- 现有一键蒸馏创建流程不被替换、不被破坏。
- 用户侧不展示 tool trace、模型选择、内部状态。

不做：

- 不在本任务调用真实 MiniMax/Kimi/DeepSeek。
- 不替换 `runOneJob` 主流程。
- 不修改 `/create` 用户流程。
- 不把 trace 暴露到普通用户 API。

## 2. 当前代码事实

当前 worker 主流程在：

```text
apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts
```

现在是线性流程：

```text
claimJobs
  -> loadSelectedCandidates
  -> createApprovedSourceSnapshot
  -> runDistillJob
  -> getPreviewGateMissingReasons
  -> persistCandidateVersion | NEEDS_MORE_SOURCES | FAILED
```

当前模型调用在：

```text
apps/worker/src/jobs/distill/run-distill-job.ts
```

能力现状：

- DeepSeek reasoner 用于最终 profile/prompt 合成。
- Kimi 已在 API 侧用于 source discovery，不在 worker 主流程里。
- MiniMax tool-calling 已在 API 侧 chat planner 存在，但 worker 不能直接复用 `apps/api` 代码。

## 3. 模型角色能力判断

本任务不调用模型，但要把未来模型边界写进代码结构。

推荐分工：

| 角色 | 模型/实现 | 是否适合 | 原因 | 代码兜底 |
| --- | --- | --- | --- | --- |
| Flow planner/router | MiniMax function calling | 适合，但需要 adapter contract test | 它擅长按工具列表选择下一步，能让 flow 不只是线性调用 | 状态机校验 tool 顺序；非法调用拒绝并 trace |
| 长资料搜索/抽取候选 | Kimi | 适合做资料层，不适合最终 persona 合成 | 已有 web search tool loop，适合收集和摘要公开资料 | source sanitizer、risk flags、dedupe |
| 最终 profile/prompt 合成 | DeepSeek reasoner | 适合 | 强推理合成和一致性检查更稳定 | 只在 `COVERAGE_SCORED` 后调用；输出必须 schema parse |
| 权限/状态/落库 | TypeScript | 必须由代码做 | 这是安全边界，不能交给模型 | tool 前置条件、DB transaction、幂等 |

原则：

- MiniMax 只能请求 tool call，不能直接改 DB。
- Kimi 只产资料候选或长文摘要，不产最终人格。
- DeepSeek 只做 profile/prompt 合成和一致性检查，不决定是否可落库。
- TypeScript 状态机是最终裁决者。

## 4. 文件范围

Create:

- `packages/contracts/src/distill-tools.ts`
- `packages/contracts/src/distill-tools.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts`
- `apps/worker/src/jobs/persona-distill/tool-runtime/index.ts`

Modify:

- `packages/contracts/src/index.ts`
- `apps/api/src/db/schema.sql`
- `apps/api/src/db/bootstrap.ts`

Review only unless typecheck requires:

- `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`

## 5. Contract 设计

新增 `packages/contracts/src/distill-tools.ts`。

### 5.1 Runtime state

```ts
export const distillRuntimeStateSchema = z.enum([
  "START",
  "RISK_CHECKED",
  "SOURCES_COLLECTED",
  "SOURCES_CLEANED",
  "EVIDENCE_EXTRACTED",
  "COVERAGE_SCORED",
  "PROFILE_GENERATED",
  "PROFILE_VALIDATED",
  "PERSISTED",
  "NEEDS_SOURCES",
  "FAILED",
]);
```

Terminal states:

```ts
export const distillTerminalRuntimeStates = ["PERSISTED", "NEEDS_SOURCES", "FAILED"] as const;
```

### 5.2 Tool names

```ts
export const distillToolNameSchema = z.enum([
  "check_distill_intent_risk",
  "search_sources",
  "clean_sources",
  "extract_evidence",
  "score_source_coverage",
  "generate_persona_profile",
  "validate_persona_profile",
  "persist_persona_candidate",
  "mark_job_needs_sources",
  "mark_job_failed",
]);
```

### 5.3 Tool call schema

使用 discriminated union：

```ts
export const distillToolCallSchema = z.discriminatedUnion("toolName", [
  z.object({
    toolName: z.literal("check_distill_intent_risk"),
    input: z.object({
      intentId: z.string().uuid(),
      normalizedName: z.string().min(1),
      entityType: distillEntityTypeSchema,
      riskDecision: distillRiskDecisionSchema,
      riskReasons: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    toolName: z.literal("search_sources"),
    input: z.object({
      discoveryId: z.string().uuid(),
      selectedSourceCandidateIds: z.array(z.string().uuid()).default([]),
      selectedExtraSourceIds: z.array(z.string().uuid()).default([]),
    }),
  }),
  z.object({
    toolName: z.literal("clean_sources"),
    input: z.object({
      maxCharsPerSource: z.number().int().min(200).max(5000).default(1200),
      dropLowTrustSources: z.boolean().default(false),
    }),
  }),
  z.object({
    toolName: z.literal("extract_evidence"),
    input: z.object({
      buckets: z.array(distillEvidenceBucketSchema).default([]),
      maxEvidencePerBucket: z.number().int().min(1).max(12).default(4),
    }),
  }),
  z.object({
    toolName: z.literal("score_source_coverage"),
    input: z.object({
      minimumSources: z.number().int().min(1).max(10).default(3),
      minimumBuckets: z.number().int().min(1).max(6).default(2),
    }),
  }),
  z.object({
    toolName: z.literal("generate_persona_profile"),
    input: z.object({
      displayName: z.string().min(1),
      distillFocus: z.array(z.string().min(1)).min(1).max(8),
    }),
  }),
  z.object({
    toolName: z.literal("validate_persona_profile"),
    input: z.object({
      strictness: z.enum(["preview", "publish"]).default("preview"),
    }),
  }),
  z.object({
    toolName: z.literal("persist_persona_candidate"),
    input: z.object({
      idempotencyKey: z.string().min(1),
    }),
  }),
  z.object({
    toolName: z.literal("mark_job_needs_sources"),
    input: z.object({
      missingRequirements: z.array(z.string().min(1)).min(1),
      userMessage: z.string().min(1).max(160),
    }),
  }),
  z.object({
    toolName: z.literal("mark_job_failed"),
    input: z.object({
      code: z.string().min(1),
      message: z.string().min(1).max(500),
      retryable: z.boolean().default(true),
    }),
  }),
]);
```

### 5.4 Tool result schema

结果必须简短。`summary` 限长只是 contract 层约束；真正入库前还必须走 trace sanitizer。

```ts
export const distillToolResultSchema = z.object({
  ok: z.boolean(),
  stateAfter: distillRuntimeStateSchema,
  summary: z.string().max(1000),
  data: z.record(z.string(), z.unknown()).default({}),
});
```

### 5.5 导出

`packages/contracts/src/index.ts` 增加：

```ts
export * from "./distill-tools.js";
```

## 6. DB 设计

新增 trace 表。

`apps/api/src/db/schema.sql`：

```sql
CREATE TABLE persona_distill_tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES persona_distill_jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  runtime_state_before TEXT NOT NULL,
  runtime_state_after TEXT,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX persona_distill_tool_runs_job_seq_idx
  ON persona_distill_tool_runs (job_id, seq);

CREATE INDEX persona_distill_tool_runs_job_started_idx
  ON persona_distill_tool_runs (job_id, started_at ASC);
```

`apps/api/src/db/bootstrap.ts` 用 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS` 添加同样结构。

状态值：

```text
RUNNING
SUCCEEDED
FAILED
REJECTED
```

含义：

- `RUNNING`：tool run 已开始，未完成。
- `SUCCEEDED`：tool 执行成功并产生合法 output。
- `FAILED`：tool 执行异常。
- `REJECTED`：状态机拒绝非法 tool 顺序，未执行 tool。

## 7. Worker Runtime 设计

### 7.1 State machine

文件：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.ts
```

核心 API：

```ts
export const isTerminalDistillRuntimeState = (state: DistillRuntimeState) =>
  state === "PERSISTED" || state === "NEEDS_SOURCES" || state === "FAILED";

export const getNextRuntimeStateForTool = (
  state: DistillRuntimeState,
  toolName: DistillToolName,
): DistillRuntimeState => {
  // throws DistillToolStateError if not allowed
};
```

允许路径：

```text
START -> check_distill_intent_risk -> RISK_CHECKED
RISK_CHECKED -> search_sources -> SOURCES_COLLECTED
SOURCES_COLLECTED -> clean_sources -> SOURCES_CLEANED
SOURCES_CLEANED -> extract_evidence -> EVIDENCE_EXTRACTED
EVIDENCE_EXTRACTED -> score_source_coverage -> COVERAGE_SCORED
COVERAGE_SCORED -> generate_persona_profile -> PROFILE_GENERATED
PROFILE_GENERATED -> validate_persona_profile -> PROFILE_VALIDATED
PROFILE_VALIDATED -> persist_persona_candidate -> PERSISTED
```

可恢复终态：

```text
RISK_CHECKED | SOURCES_COLLECTED | SOURCES_CLEANED | EVIDENCE_EXTRACTED | COVERAGE_SCORED
  -> mark_job_needs_sources -> NEEDS_SOURCES
```

失败终态：

```text
任何非 terminal state -> mark_job_failed -> FAILED
```

拒绝：

- terminal state 不允许任何 tool。
- `persist_persona_candidate` 只能从 `PROFILE_VALIDATED` 进入。
- `generate_persona_profile` 只能从 `COVERAGE_SCORED` 进入。
- `extract_evidence` 只能从 `SOURCES_CLEANED` 进入。

### 7.2 Tool registry

文件：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.ts
```

核心类型：

```ts
export type DistillToolContext = {
  jobId: string;
  actorUserId: string;
  personaId: string;
  runtimeState: DistillRuntimeState;
};

export type DistillToolHandler = {
  toolName: DistillToolName;
  execute(input: unknown, context: DistillToolContext): Promise<DistillToolResult>;
};
```

本任务只做骨架工具，不真正跑模型：

- 每个 tool handler 先 parse input。
- 返回合法 `DistillToolResult`。
- `persist_persona_candidate` 在本任务不实际写 candidate，只返回 `{ ok: true, summary: "persist tool placeholder" }`，主流程暂不调用它。

原因：

- 本任务目标是底座和状态机，不替换业务流程。
- 真正把 handler 接到现有 `createApprovedSourceSnapshot/runDistillJob/persistCandidateVersion` 留到下一任务，避免一次改坏 worker。

### 7.3 Trace sanitizer

文件：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.ts
```

核心 API：

```ts
export const sanitizeDistillToolTraceJson = (value: unknown) => sanitizedJson;
```

硬规则：

- 字符串最多保留 500 字符，超出后追加 `...<truncated>`。
- 数组最多保留 20 项。
- object 最多保留 40 个 key。
- 嵌套深度最多 5 层。
- 以下 key 一律替换为 `"[redacted]"`：

```text
content
rawContent
rawHtml
normalizedText
html
body
fullText
sourceText
apiKey
authorization
token
password
```

- JSON 序列化后最大 12KB；超过则返回：

```ts
{
  truncated: true,
  reason: "trace_json_too_large",
  preview: "...",
}
```

原因：

- `input_json/output_json` 是内部排查用，不是资料仓库。
- 搜索、证据抽取、用户补充资料可能包含长正文或敏感内容，不能完整写 trace。

### 7.4 Tool run store

文件：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.ts
```

核心 API：

```ts
export const startDistillToolRun = async (input: {
  jobId: string;
  seq: number;
  toolName: DistillToolName;
  runtimeStateBefore: DistillRuntimeState;
  inputJson: unknown;
}) => Promise<{ id: string }>;

export const finishDistillToolRun = async (input: {
  id: string;
  status: "SUCCEEDED" | "FAILED" | "REJECTED";
  runtimeStateAfter: DistillRuntimeState | null;
  outputJson: unknown;
  errorMessage?: string | null;
}) => Promise<void>;
```

使用 `getSql()`，不引入 API 层 repository。

写入前必须调用：

```ts
sanitizeDistillToolTraceJson(input.inputJson)
sanitizeDistillToolTraceJson(input.outputJson)
```

store 层是最后一道保护，不能依赖 handler 自觉裁剪。

### 7.5 Runtime executor

文件：

```text
apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.ts
```

本任务提供小型 executor，不接主流程：

```ts
export const executeDistillToolStep = async (input: {
  seq: number;
  call: DistillToolCall;
  context: DistillToolContext;
}) => {
  const nextState = getNextRuntimeStateForTool(input.context.runtimeState, input.call.toolName);
  // start trace
  // execute handler
  // finish trace
  // return state/result, stateAfter must be nextState
};
```

硬边界：

- `nextState` 由 `getNextRuntimeStateForTool()` 计算，是唯一可信 `stateAfter`。
- handler 返回的 `result.stateAfter` 不能决定状态。
- executor 必须严格断言 `handlerResult.stateAfter === nextState`。
- 如果 handler 返回不一致 state：
  - 写 `FAILED` trace。
  - `runtime_state_after` 写状态机计算出的 `nextState` 或 `null`，不得写 handler 的非法状态。
  - 抛出 `DistillToolStateError`。
  - 不把非法状态传给调用方。

非法顺序：

- 写入 `REJECTED` trace。
- 抛出 `DistillToolStateError`。
- 不执行 handler。

## 8. 测试计划

### 8.1 Contract tests

Create:

```text
packages/contracts/src/distill-tools.test.ts
```

测试点：

```ts
test("distill tool schemas parse legal tool calls", () => {
  const parsed = distillToolCallSchema.parse({
    toolName: "score_source_coverage",
    input: {
      minimumSources: 3,
      minimumBuckets: 2,
    },
  });
  assert.equal(parsed.toolName, "score_source_coverage");
});

test("distill tool schemas reject unknown tool names", () => {
  assert.throws(
    () => distillToolCallSchema.parse({ toolName: "drop_all_tables", input: {} }),
    /Invalid|invalid|No matching discriminator/,
  );
});
```

Run:

```bash
node --import tsx --test packages/contracts/src/distill-tools.test.ts
```

### 8.2 State machine tests

Create:

```text
apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts
```

测试点：

```ts
assert.equal(getNextRuntimeStateForTool("START", "check_distill_intent_risk"), "RISK_CHECKED");
assert.equal(getNextRuntimeStateForTool("PROFILE_VALIDATED", "persist_persona_candidate"), "PERSISTED");
assert.throws(() => getNextRuntimeStateForTool("START", "persist_persona_candidate"), /not allowed/);
assert.throws(() => getNextRuntimeStateForTool("PERSISTED", "mark_job_failed"), /terminal/);
```

Run:

```bash
node --import tsx --test apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts
```

### 8.3 Registry tests

Create:

```text
apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.test.ts
```

测试点：

- registry 包含全部 `distillToolNameSchema.options`。
- handler 会 parse input。
- unknown tool name 不会被 registry 返回。

Run:

```bash
node --import tsx --test apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.test.ts
```

### 8.4 Store tests

Create:

```text
apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.test.ts
```

不连真实 DB，使用 fake sql function 记录 query 调用，验证：

- `startDistillToolRun` 写入 `RUNNING`。
- `finishDistillToolRun` 写入 `SUCCEEDED/FAILED/REJECTED` 和 `finished_at`。
- store 写入前调用 trace sanitizer。

如果 fake postgres template 难以维护，则改为 focused type/unit test：验证 store input schema 和 SQL helper 返回 shape，DB create 由 `schema.sql/bootstrap.ts` 审查和 typecheck 覆盖。

### 8.5 Trace sanitizer tests

Create:

```text
apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.test.ts
```

测试点：

```ts
const sanitized = sanitizeDistillToolTraceJson({
  title: "资料",
  content: "x".repeat(2000),
  nested: {
    normalizedText: "secret long text",
  },
});

assert.equal(sanitized.content, "[redacted]");
assert.equal(sanitized.nested.normalizedText, "[redacted]");
assert.doesNotMatch(JSON.stringify(sanitized), /secret long text/);
```

再测字符串截断：

```ts
const sanitized = sanitizeDistillToolTraceJson({ snippet: "x".repeat(900) });
assert.match(sanitized.snippet, /<truncated>/);
assert.ok(sanitized.snippet.length < 540);
```

Run:

```bash
node --import tsx --test apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.test.ts
```

### 8.6 Runtime executor tests

Create:

```text
apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts
```

测试点：

- 合法执行：`START + check_distill_intent_risk` 执行 handler，返回 `RISK_CHECKED`。
- 非法顺序：`START + persist_persona_candidate` 写 `REJECTED` trace，不执行 handler。
- handler 返回错误 stateAfter：例如允许 `clean_sources` 的 nextState 应为 `SOURCES_CLEANED`，handler 返回 `PERSISTED`，executor 写 `FAILED` trace 并抛错。

测试使用 fake store 和 fake registry，不连 DB。

Run:

```bash
node --import tsx --test apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts
```

### 8.7 Typecheck

Run:

```bash
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/worker typecheck
pnpm --filter @hall-of-fame/api typecheck
```

### 8.8 Existing flow regression

必须跑现有蒸馏路径的 focused test，证明主流程未被替换：

```bash
cd apps/api && node --import tsx --test --test-name-pattern "creating the same active distill job is idempotent" src/persona-distill-v2.test.ts
```

## 9. 实施步骤

- [ ] 写 `packages/contracts/src/distill-tools.test.ts`，先验证 schema 失败。
- [ ] 写 `packages/contracts/src/distill-tools.ts`，导出 runtime state、tool name、tool call、tool result 类型。
- [ ] 更新 `packages/contracts/src/index.ts`。
- [ ] 跑 contract test，确认通过。
- [ ] 写 `state-machine.test.ts`，先验证缺少实现失败。
- [ ] 写 `state-machine.ts`，实现 allowed transition 和 `DistillToolStateError`。
- [ ] 跑 state machine test，确认通过。
- [ ] 写 `tool-registry.test.ts`，先验证 registry 缺失失败。
- [ ] 写 `tool-registry.ts`，实现全工具占位 handler 和 parse。
- [ ] 跑 registry test，确认通过。
- [ ] 写 `trace-sanitizer.test.ts`，先验证长正文/敏感 key 会进入 trace 的风险。
- [ ] 写 `trace-sanitizer.ts`，实现 redaction、截断、数组/object/depth 限制、总大小限制。
- [ ] 跑 trace sanitizer test，确认通过。
- [ ] 修改 `apps/api/src/db/schema.sql`，加入 `persona_distill_tool_runs`。
- [ ] 修改 `apps/api/src/db/bootstrap.ts`，加入 create table/index。
- [ ] 写 `tool-run-store.ts` 和 `tool-run-store.test.ts`。
- [ ] 写 `runtime-executor.test.ts`，覆盖合法执行、非法顺序不执行 handler、handler 错误 stateAfter 被拒绝。
- [ ] 写 `runtime-executor.ts`，状态以 state machine `nextState` 为准，并对 handler stateAfter 做一致性校验。
- [ ] 写 `index.ts` 汇总导出 runtime 模块。
- [ ] 跑全部新增 unit tests。
- [ ] 跑 contracts/worker/api typecheck。
- [ ] 跑 focused existing flow regression。
- [ ] 交给 Kant 做实现验收。

## 10. 验收标准

- contract 层能 parse 合法 tool call，拒绝未知 tool。
- 状态机能拒绝非法顺序，尤其 `START -> persist_persona_candidate`。
- terminal state 不允许继续调用 tool。
- registry 覆盖所有 tool name。
- executor 不信任 handler 的非法 `stateAfter`。
- 非法顺序会写 `REJECTED` trace，且不执行 handler。
- trace sanitizer 会 redaction 长正文/敏感 key，并限制字符串、数组、object、深度和总大小。
- DB schema/bootstrap 有 `persona_distill_tool_runs` 和必要索引。
- worker typecheck 通过。
- 现有 persona distill job focused regression 通过。
- 没有用户侧 UI/API 暴露 tool trace。

## 11. 风险

- 风险：一次性替换 worker 主流程会破坏创建闭环。处理：本任务只新增底座，不接 `runOneJob`。
- 风险：MiniMax tool call 未来不稳定。处理：本任务先以状态机和 schema 为硬边界；下一任务必须加 adapter contract/capability test。
- 风险：trace 表存入长资料导致成本和隐私问题。处理：tool result schema 限制 summary，handler 输出不保存完整正文。
- 风险：DB schema 只改 `schema.sql` 漏掉 bootstrap。处理：两处都改，并跑 API typecheck/focused regression。
- 风险：worker 引用 API 层 MiniMax client 造成架构反向依赖。处理：Task 5 不引用 API adapter；Task 6 若要复用，应抽到 package 或在 worker 建独立 adapter。
