# Chat Planner 自主工具判断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` 或等价的 subagent review gate。每个阶段必须先给出本阶段落地计划，再由 subagent review；实现后必须由 subagent 验收业务符合性和技术质量。

**Goal:** 让聊天 planner 自主判断本轮是否需要 `memory`、`persona knowledge`、`web search` 或 `proactive`，移除本地规则对模型决策的强制覆盖。

**Architecture:** 第一版不迁移 `ChatTurnPlan` 合同，继续使用现有 `needChatMemory`、`needPersonaKnowledge`、`needWebSearch` 字段，降低前后端和 workflow 风险。重构重点是：删除 `applyHardGuardOverrides` 正常链路覆盖，重写 planner prompt 为“上下文依赖判断”，保留 planner 失败时的 fallback，并增强 trace 让每轮工具计划可回放。

**Tech Stack:** TypeScript、Node test runner、Fastify route、`@hall-of-fame/contracts`、DeepSeek/Kimi/MiniMax planner clients、chat trace collector、pnpm workspace。

---

## 1. 非目标

- 不改前端 UI。
- 不改变最终回复模型，DeepSeek 仍是最终用户可见回复模型。
- 不把 MiniMax function call tool loop 接入同步聊天热路径。
- 不改 `ChatTurnPlan` schema 字段形状；`answerability/tools/confidence` 作为后续 V2 方向，不在本次落地。
- 不移除 planner 失败 fallback；fallback 只允许在 planner 未配置、超时、解析失败、schema 校验失败时生效。

## 1.1 Planner 状态语义

这次必须把 planner 状态拆清楚，避免把“禁用 planner 的本地默认路径”误认为自主 planner：

| 状态 | 触发条件 | 返回语义 | 是否代表自主判断 |
| --- | --- | --- | --- |
| `success` | `CHAT_PLANNER_ENABLED=true` 且模型成功返回合法 plan | 使用模型 plan，后端只做 schema 校验和 research plan normalize | 是 |
| `disabled` | `CHAT_PLANNER_ENABLED` 不是 `true` 或 mode 不是 `decision` | `runChatPlanner` 返回 `null`，route 走历史本地 routing，memory/persona 默认 true | 否 |
| `not_configured` | planner 开启但 provider API key 缺失 | 进入 catch；记录失败；只有 fallback plan 需要 web/proactive 时才返回 fallback，否则返回 `null` | 否 |
| `timeout` | planner 超时 | 同 `not_configured` | 否 |
| `parse_failed` | 模型返回无法解析或不符合 schema | 同 `not_configured` | 否 |

trace 必须能区分：

- `plannerStatus`: `success | disabled | not_configured | timeout | parse_failed | unknown_failed`
- `fallbackUsed`: boolean
- `plannerDecisionSource`: `fast_planner | minimax | fallback | null`
- `decisionFinalizedBy`: `schema_validation | fallback | none`

## 2. 阶段总览

| 阶段 | 目标 | 主要文件 | 验收口径 |
| --- | --- | --- | --- |
| 0 | 计划 review 通过 | 本文档 | subagent 确认阶段完整、可落地、符合“planner 自主判断工具使用” |
| 1 | 移除 hard guard 正常链路覆盖 | `apps/api/src/services/minimax-planner/chat-planner.ts`、对应测试 | 模型返回不搜，最终 plan 不再被关键词强制改成搜索 |
| 2 | 重写 planner prompt 为上下文依赖判断 | `chat-planner.ts`、`fast-planner-client.ts`、对应测试 | prompt 不再强调“规则：关键词=工具”，而是强调回答可靠性和上下文依赖 |
| 3 | 增强工具计划 trace | `apps/api/src/routes/chats.ts`、新增小工具测试 | trace 能看到 planner 原始决策、最终工具计划、实际执行的工具 |
| 4 | 增加 planner fixture 收敛测试 | `chat-planner.test.ts`、`fast-planner-client.test.ts` | 6 类典型消息覆盖 direct/memory/persona/web/mixed/proactive |
| 5 | 全量验证与开发记录 | `docs/project-evolution-timeline.md` | 目标测试、typecheck 通过；开发过程文档记录完整 |

## 3. 阶段 1：移除 `applyHardGuardOverrides`

### 3.1 本阶段目标

正常 planner 成功时，后端只做 schema 校验和必要 normalize，不再因为“今天 / 最新 / 记得”等关键词覆盖模型决策。

### 3.2 修改文件

- Modify: `apps/api/src/services/minimax-planner/chat-planner.ts`
- Modify: `apps/api/src/services/minimax-planner/chat-planner.test.ts`

### 3.3 详细步骤

- [ ] **Step 1: 先写失败测试**

在 `chat-planner.test.ts` 中新增第一个测试，证明纯 finalizer 不会改写模型 plan：

```ts
test("planner finalization preserves model tool decision without hard guard override", () => {
  const plan = __internal.finalizePlannerDecision({
    decisionSource: "fast_planner",
    userIntent: "模型认为当前轮可以直接答",
    replyMode: "CASUAL",
    personaIntensity: "low",
    answerMode: "casual",
    retrievalHints: {
      focusQueries: [],
      boostScopes: [],
    },
    needChatMemory: false,
    needPersonaKnowledge: false,
    needWebSearch: false,
    webSearchQuery: null,
    webSearchReason: null,
    researchPlan: null,
    contextUsed: [],
    replyGoal: "自然回应",
    responseOutline: ["直接回应"],
    shouldSendMultipleMessages: false,
    suggestedMessageCount: 1,
    avoidRepeating: [],
    proactiveCandidate: {
      shouldSchedule: false,
      delaySeconds: null,
      topic: null,
      reason: null,
    },
  });

  assert.equal(plan.needWebSearch, false);
  assert.equal(plan.needChatMemory, false);
  assert.equal(plan.needPersonaKnowledge, false);
  assert.equal(plan.webSearchQuery, null);
});
```

预期：当前代码没有 `finalizePlannerDecision`，测试失败。

再新增第二个测试，覆盖 `runChatPlanner` 成功路径，证明含有“今天 / 记得”的输入也不会被正常链路强制改写：

```ts
test("runChatPlanner keeps a successful model decision even when message contains fresh and memory words", async () => {
  const previousEnv = {
    plannerEnabled: process.env.CHAT_PLANNER_ENABLED,
    plannerProvider: process.env.CHAT_FAST_PLANNER_PROVIDER,
    plannerApiKey: process.env.CHAT_FAST_PLANNER_API_KEY,
    plannerTimeout: process.env.CHAT_PLANNER_TIMEOUT_MS,
  };
  process.env.CHAT_PLANNER_ENABLED = "true";
  process.env.CHAT_FAST_PLANNER_PROVIDER = "deepseek";
  process.env.CHAT_FAST_PLANNER_API_KEY = "planner-key";
  process.env.CHAT_PLANNER_TIMEOUT_MS = "1000";

  const { buildApiApp } = await import("../../app.js");
  const { resetSqlForTests } = await import("../../db/client.js");
  const { saveChatSession } = await import("../../store/chat-store.js");
  const apiApp = buildApiApp();
  await apiApp.ready();
  const chatId = randomUUID();

  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                m: 0,
                i: 0,
                cm: false,
                pk: false,
                ws: false,
                q: null,
                rp: null,
                pro: false,
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });

    const plan = await runChatPlanner({
      chatId,
      personaId: null,
      personaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      content: "今天尚界Z7怎么样？你还记得我刚才说什么吗？",
      latestMessageId: null,
      latestTurnIndex: null,
      turnTraceId: randomUUID(),
    });

    assert.ok(plan);
    assert.equal(plan.needWebSearch, false);
    assert.equal(plan.needChatMemory, false);
    assert.equal(plan.needPersonaKnowledge, false);
  } finally {
    fetchMock.mock.restore();
    await apiApp.close();
    await resetSqlForTests();
    if (previousEnv.plannerEnabled === undefined) delete process.env.CHAT_PLANNER_ENABLED;
    else process.env.CHAT_PLANNER_ENABLED = previousEnv.plannerEnabled;
    if (previousEnv.plannerProvider === undefined) delete process.env.CHAT_FAST_PLANNER_PROVIDER;
    else process.env.CHAT_FAST_PLANNER_PROVIDER = previousEnv.plannerProvider;
    if (previousEnv.plannerApiKey === undefined) delete process.env.CHAT_FAST_PLANNER_API_KEY;
    else process.env.CHAT_FAST_PLANNER_API_KEY = previousEnv.plannerApiKey;
    if (previousEnv.plannerTimeout === undefined) delete process.env.CHAT_PLANNER_TIMEOUT_MS;
    else process.env.CHAT_PLANNER_TIMEOUT_MS = previousEnv.plannerTimeout;
  }
});
```

这个测试需要同步补充 imports：

```ts
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { __internal, isExplicitProactiveRequest, runChatPlanner, shouldRunChatPlannerForTurn } from "./chat-planner.js";
```

- [ ] **Step 2: 实现最小代码**

在 `chat-planner.ts` 增加：

```ts
const finalizePlannerDecision = (plan: ChatTurnPlan) => chatTurnPlanSchema.parse(plan);
```

在 `runChatPlanner` 中替换：

```ts
const hardGuardResult = applyHardGuardOverrides({
  content: input.content,
  plan: chatTurnPlanSchema.parse(result.plan),
});
const plan = hardGuardResult.plan;
```

为：

```ts
const plan = finalizePlannerDecision(result.plan);
```

同时 trace 字段删除 `hardGuardApplied`，改为：

```ts
fallbackUsed: false,
decisionFinalizedBy: "schema_validation",
plannerStatus: "success",
```

- [ ] **Step 3: 删除 hard guard 代码和旧测试**

删除：

- `freshInfoPattern` / `memoryRecallPattern` 对正常链路的覆盖用途。
- `isMemoryRecallRequest`。
- `minPersonaIntensity` 如果不再使用。
- `applyHardGuardOverrides` 函数。
- `__internal.applyHardGuardOverrides` 导出。
- 两个 hard guard 测试：
  - `planner hard guard overrides missed fresh-info decisions`
  - `planner hard guard replaces stale model-generated web search query for fresh-info requests`

保留：

- `isExplicitProactiveRequest`，因为 route 创建 proactive job 前仍需要显式用户意图保护。
- `buildFallbackChatTurnPlan`，但它只在 catch 分支使用。
- `isFreshInfoFallbackRequest`，只允许 fallback 路径使用。

- [ ] **Step 4: 本阶段测试**

运行：

```bash
pnpm --filter @hall-of-fame/api test -- src/services/minimax-planner/chat-planner.test.ts
```

预期：planner 测试通过，且没有 hard guard 相关测试。

### 3.4 Subagent 验收标准

- 确认正常 planner 成功路径没有调用 `applyHardGuardOverrides` 或等价规则覆盖。
- 确认 fallback 仍只在异常路径执行。
- 确认 proactive 显式请求保护没有被误删。
- 确认 `runChatPlanner` 成功路径测试覆盖了含“今天 / 记得”等词的输入。
- 确认 disabled/not_configured/timeout/parse_failed 的 trace 语义没有混成同一种 fallback。

## 4. 阶段 2：重写 planner prompt

### 4.1 本阶段目标

planner 不再像关键词路由器，而是判断“最终回复是否缺上下文”。这一步是让模型自主判断工具使用的核心。

### 4.2 修改文件

- Modify: `apps/api/src/services/minimax-planner/chat-planner.ts`
- Modify: `apps/api/src/services/minimax-planner/fast-planner-client.ts`
- Modify: `apps/api/src/services/minimax-planner/chat-planner.test.ts`
- Modify: `apps/api/src/services/minimax-planner/fast-planner-client.test.ts`

### 4.3 prompt 语义

系统 prompt 必须表达：

```text
你不是最终回复模型，也不是关键词规则路由器。
你的任务是判断这次回复是否缺少上下文。
如果当前消息可以直接自然回应，不要选择工具。
如果缺用户历史，选择聊天记忆。
如果缺对象资料，选择人物资料。
如果缺最新事实或外部证据，选择联网搜索。
如果同时缺多个上下文，可以同时选择多个工具。
不要因为出现单个词就机械选择工具，要结合当前消息、最近上下文、persona context 和 runtime context 判断。
```

系统 prompt 必须避免：

```text
如果用户问今天/最新，needWebSearch 必须为 true。
问刚才/记得，cm=true。
问稍后/提醒，pro=true。
任何“关键词出现 => 某工具必须为 true”的表达。
```

### 4.4 详细步骤

- [ ] **Step 1: 写 prompt 测试**

在 `chat-planner.test.ts` 中更新 prompt 测试，要求包含：

```ts
assert.match(prompt, /上下文依赖/);
assert.match(prompt, /不是关键词规则路由器/);
assert.match(prompt, /可以同时选择多个工具/);
assert.doesNotMatch(prompt, /规则：问今天/);
assert.doesNotMatch(prompt, /今天[\s\S]{0,80}needWebSearch[\s\S]{0,40}必须/);
assert.doesNotMatch(prompt, /最新[\s\S]{0,80}needWebSearch[\s\S]{0,40}必须/);
assert.doesNotMatch(prompt, /刚才[\s\S]{0,80}cm\s*=\s*true/);
assert.doesNotMatch(prompt, /提醒[\s\S]{0,80}pro\s*=\s*true/);
```

在 `fast-planner-client.test.ts` 中新增：

```ts
import { buildFastPlannerSystemPrompt } from "./fast-planner-client.js";

test("Fast planner prompt frames tool choice as context dependency instead of keyword rules", () => {
  const prompt = buildFastPlannerSystemPrompt();

  assert.match(prompt, /上下文依赖/);
  assert.match(prompt, /不是关键词规则路由器/);
  assert.match(prompt, /不要因为出现单个词就机械选择工具/);
  assert.doesNotMatch(prompt, /规则：/);
  assert.doesNotMatch(prompt, /今天[\s\S]{0,80}ws\s*=\s*true/);
  assert.doesNotMatch(prompt, /刚才[\s\S]{0,80}cm\s*=\s*true/);
  assert.doesNotMatch(prompt, /提醒[\s\S]{0,80}pro\s*=\s*true/);
});
```

- [ ] **Step 2: 改写 full planner prompt**

重写 `buildPlannerSystemPrompt()`，保留现有 JSON 形状，但把规则语气改成判断原则和示例。

- [ ] **Step 3: 改写 fast planner prompt**

重写 `buildFastPlannerSystemPrompt()`，保留 compact JSON 字段说明，但删除所有 `规则：` 行。

- [ ] **Step 4: 本阶段测试**

运行：

```bash
pnpm --filter @hall-of-fame/api test -- src/services/minimax-planner/chat-planner.test.ts src/services/minimax-planner/fast-planner-client.test.ts
```

### 4.5 Subagent 验收标准

- prompt 仍然能让模型输出现有 schema。
- prompt 没有把关键词映射写成硬规则。
- prompt 明确允许多个工具并行选择。
- prompt 明确区分 planner 和最终回复模型。

## 5. 阶段 3：工具计划 trace 增强

### 5.1 本阶段目标

删除 hard guard 后，必须能从 trace 看懂每轮 planner 为什么选择某些工具，以及后端实际执行了哪些工具。

### 5.2 修改文件

- Create: `apps/api/src/services/minimax-planner/tool-plan-trace.ts`
- Create: `apps/api/src/services/minimax-planner/tool-plan-trace.test.ts`
- Modify: `apps/api/src/routes/chats.ts`

### 5.3 详细步骤

- [ ] **Step 1: 写工具计划 helper 测试**

新增 `tool-plan-trace.test.ts`：

```ts
test("buildRequestedPlannerTools lists selected context tools", () => {
  const tools = buildRequestedPlannerTools({
    needChatMemory: true,
    needPersonaKnowledge: true,
    needWebSearch: false,
    proactiveCandidate: { shouldSchedule: false },
  });

  assert.deepEqual(tools, ["chat_memory", "persona_knowledge"]);
});

test("buildRequestedPlannerTools includes web search and proactive when requested", () => {
  const tools = buildRequestedPlannerTools({
    needChatMemory: false,
    needPersonaKnowledge: false,
    needWebSearch: true,
    proactiveCandidate: { shouldSchedule: true },
  });

  assert.deepEqual(tools, ["web_search", "proactive_candidate"]);
});

test("buildToolExecutionTrace separates requested, attempted and result-used tools", () => {
  const trace = buildToolExecutionTrace({
    requestedTools: ["chat_memory", "persona_knowledge", "web_search"],
    chatMemoryRequested: true,
    chatMemoryReturnedCount: 2,
    personaKnowledgeRequested: true,
    personaKnowledgeReturnedCount: 0,
    webSearchRequested: true,
    webSearchAttempted: true,
    webSearchResultUsed: false,
    proactiveRequested: false,
    proactiveOutcome: "not_requested",
  });

  assert.deepEqual(trace.requestedTools, ["chat_memory", "persona_knowledge", "web_search"]);
  assert.deepEqual(trace.attemptedTools, ["chat_memory", "persona_knowledge", "web_search"]);
  assert.deepEqual(trace.resultUsedTools, ["chat_memory"]);
  assert.equal(trace.webSearchResultUsed, false);
});
```

- [ ] **Step 2: 实现 `tool-plan-trace.ts`**

实现：

```ts
export type PlannerToolName =
  | "chat_memory"
  | "persona_knowledge"
  | "web_search"
  | "proactive_candidate";

export const buildRequestedPlannerTools = (input: {
  needChatMemory: boolean;
  needPersonaKnowledge: boolean;
  needWebSearch: boolean;
  proactiveCandidate: { shouldSchedule: boolean };
}): PlannerToolName[] => {
  const tools: PlannerToolName[] = [];
  if (input.needChatMemory) tools.push("chat_memory");
  if (input.needPersonaKnowledge) tools.push("persona_knowledge");
  if (input.needWebSearch) tools.push("web_search");
  if (input.proactiveCandidate.shouldSchedule) tools.push("proactive_candidate");
  return tools;
};

export type ProactiveTraceOutcome =
  | "not_requested"
  | "created"
  | "skipped_disabled"
  | "skipped_not_explicit"
  | "failed";

export const buildToolExecutionTrace = (input: {
  requestedTools: PlannerToolName[];
  chatMemoryRequested: boolean;
  chatMemoryReturnedCount: number;
  personaKnowledgeRequested: boolean;
  personaKnowledgeReturnedCount: number;
  webSearchRequested: boolean;
  webSearchAttempted: boolean;
  webSearchResultUsed: boolean;
  proactiveRequested: boolean;
  proactiveOutcome: ProactiveTraceOutcome;
}) => {
  const attemptedTools: PlannerToolName[] = [];
  const resultUsedTools: PlannerToolName[] = [];

  if (input.chatMemoryRequested) attemptedTools.push("chat_memory");
  if (input.personaKnowledgeRequested) attemptedTools.push("persona_knowledge");
  if (input.webSearchAttempted) attemptedTools.push("web_search");
  if (input.proactiveRequested) attemptedTools.push("proactive_candidate");

  if (input.chatMemoryReturnedCount > 0) resultUsedTools.push("chat_memory");
  if (input.personaKnowledgeReturnedCount > 0) resultUsedTools.push("persona_knowledge");
  if (input.webSearchResultUsed) resultUsedTools.push("web_search");
  if (input.proactiveOutcome === "created") resultUsedTools.push("proactive_candidate");

  return {
    requestedTools: input.requestedTools,
    attemptedTools,
    resultUsedTools,
    chatMemoryRequested: input.chatMemoryRequested,
    chatMemoryReturnedCount: input.chatMemoryReturnedCount,
    personaKnowledgeRequested: input.personaKnowledgeRequested,
    personaKnowledgeReturnedCount: input.personaKnowledgeReturnedCount,
    webSearchRequested: input.webSearchRequested,
    webSearchAttempted: input.webSearchAttempted,
    webSearchResultUsed: input.webSearchResultUsed,
    proactiveRequested: input.proactiveRequested,
    proactiveOutcome: input.proactiveOutcome,
  };
};
```

- [ ] **Step 3: 接入 route trace**

在 `chats.ts` 中 `turnPlan` 归一化后记录：

```ts
const rawTurnPlanArtifact = collector.addJsonArtifact("turn_plan_before_research_normalization", rawTurnPlan);
const finalTurnPlanArtifact = collector.addJsonArtifact("turn_plan_after_research_normalization", turnPlan);
const requestedTools = turnPlan ? buildRequestedPlannerTools(turnPlan) : [];

collector.recordEvent({
  eventName: "chat.tool_plan.finalized",
  stage: "planner",
  status: "completed",
  fields: {
    plannerDecisionSource: turnPlan?.decisionSource ?? null,
    fallbackUsed: turnPlan?.decisionSource === "fallback",
    requestedTools,
    needChatMemory: turnPlan?.needChatMemory ?? null,
    needPersonaKnowledge: turnPlan?.needPersonaKnowledge ?? null,
    needWebSearch: turnPlan?.needWebSearch ?? null,
    webSearchQuery: turnPlan?.webSearchQuery ?? null,
    answerMode: turnPlan?.answerMode ?? null,
  },
  artifactRefs: [rawTurnPlanArtifact, finalTurnPlanArtifact],
});
```

在 proactive 分支里维护：

```ts
let proactiveOutcome: ProactiveTraceOutcome = "not_requested";
```

创建成功时置为 `created`；功能禁用时置为 `skipped_disabled`；不是显式请求时置为 `skipped_not_explicit`；创建失败时置为 `failed`。

在 Kimi 分支里维护：

```ts
let webSearchAttempted = false;
let webSearchResultUsed = false;
let webSearchFreshnessStatus: string | null = null;
let webSearchSourceCount = 0;
```

进入 `if (turnPlan?.needWebSearch)` 时置 `webSearchAttempted = true`。`sanitizeWebContext` 后用 `sanitized.used` 赋值 `webSearchResultUsed`，同时记录 `freshnessStatus` 和 `sources.length`。不能用 `Boolean(webContext)` 判断是否真正用了搜索结果，因为 Kimi disabled/timeout 时也会构造 unavailable web context。

在 memory / persona / web search / proactive 分支执行后记录：

```ts
collector.recordEvent({
  eventName: "chat.tools.execution.completed",
  stage: "context",
  status: "completed",
  fields: buildToolExecutionTrace({
    requestedTools,
    chatMemoryRequested: turnPlan?.needChatMemory ?? true,
    chatMemoryReturnedCount: chatContext.retrievedMemories.length,
    personaKnowledgeRequested: turnPlan?.needPersonaKnowledge ?? true,
    personaKnowledgeReturnedCount: chatContext.personaChunks.length + chatContext.personaEvidence.length,
    webSearchRequested: turnPlan?.needWebSearch ?? false,
    webSearchAttempted,
    webSearchResultUsed,
    proactiveRequested: turnPlan?.proactiveCandidate.shouldSchedule ?? false,
    proactiveOutcome,
  }),
});
```

- [ ] **Step 4: 本阶段测试**

运行：

```bash
pnpm --filter @hall-of-fame/api test -- src/services/minimax-planner/tool-plan-trace.test.ts
pnpm --filter @hall-of-fame/api typecheck
```

### 5.4 Subagent 验收标准

- trace 命名不暴露给用户 UI。
- trace 能同时解释“planner 想用什么”、“后端尝试了什么”、“哪些结果真正进入回复上下文”。
- trace 中能看到 `turn_plan_before_research_normalization` 和 `turn_plan_after_research_normalization`。
- helper 小而独立，避免把 `chats.ts` 继续写胖。

## 6. 阶段 4：planner fixture 收敛测试

### 6.1 本阶段目标

用稳定 fixture 锁住 planner normalization 和 prompt 期望，避免之后又悄悄回到规则覆盖。

### 6.2 修改文件

- Modify: `apps/api/src/services/minimax-planner/fast-planner-client.test.ts`
- Modify: `apps/api/src/services/minimax-planner/chat-planner.test.ts`
- Modify: `apps/api/src/chat-trace.test.ts`
- Existing coverage check: `apps/api/src/services/chat-memory/assemble-chat-context.test.ts`

### 6.3 测试用例

新增或调整以下 case：

| case | 用户消息 | mocked planner 输出 | 期望 |
| --- | --- | --- | --- |
| direct | `你好` | `cm=false pk=false ws=false pro=false` | 不查工具 |
| memory | `你还记得我刚才说什么吗` | `cm=true pk=false ws=false` | 只查记忆 |
| persona | `讲讲你的生平` | `cm=false pk=true ws=false` | 查对象资料 |
| web | `你最近有什么新闻` | `cm=false pk=true ws=true` | 查对象资料和联网 |
| mixed | `结合我刚才说的，评价一下你最近这件事` | `cm=true pk=true ws=true` | 三个上下文工具都需要 |
| proactive | `十分钟后提醒我继续聊这个` | `pro=true` | proactive candidate 为 true |

注意：这些测试不证明模型一定这样判断，只证明 parser、schema、后端不会改写模型输出。真实模型能力由日志回放和人工抽样验证。

同时补一个 route 级轻量测试到 `chat-trace.test.ts`，证明当 planner 成功返回 `needWebSearch=false` 时，聊天接口不会触发 Kimi search：

```ts
test("chat route does not call Kimi when successful planner decision does not request web search", async () => {
  const previousEnv = {
    plannerEnabled: process.env.CHAT_PLANNER_ENABLED,
    plannerProvider: process.env.CHAT_FAST_PLANNER_PROVIDER,
    plannerApiKey: process.env.CHAT_FAST_PLANNER_API_KEY,
    kimiEnabled: process.env.KIMI_WEB_SEARCH_ENABLED,
    kimiApiKey: process.env.KIMI_API_KEY,
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
  };
  process.env.CHAT_PLANNER_ENABLED = "true";
  process.env.CHAT_FAST_PLANNER_PROVIDER = "deepseek";
  process.env.CHAT_FAST_PLANNER_API_KEY = "planner-key";
  process.env.KIMI_WEB_SEARCH_ENABLED = "true";
  process.env.KIMI_API_KEY = "kimi-key";
  process.env.DEEPSEEK_API_KEY = "";

  const fetchUrls: string[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    fetchUrls.push(String(url));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                m: 0,
                i: 0,
                cm: false,
                pk: false,
                ws: false,
                q: null,
                rp: null,
                pro: false,
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const { apiApp, reply } = await createChatAndSendMessage({
    content: "今天你还记得我刚才说什么吗？",
  });

  try {
    assert.equal(reply.statusCode, 200);
    assert.equal(fetchUrls.filter((url) => url.includes("moonshot") || url.includes("kimi")).length, 0);

    const turnTraceId = reply.headers["x-turn-trace-id"];
    assert.equal(typeof turnTraceId, "string");
    const traceResponse = await apiApp.inject({
      method: "GET",
      url: `/internal/debug/chat-traces/${turnTraceId}`,
    });
    const traceBody = traceResponse.json();
    const toolPlan = traceBody.events.find((event: { eventName: string }) => event.eventName === "chat.tool_plan.finalized");
    assert.deepEqual(toolPlan.fields.requestedTools, []);
  } finally {
    fetchMock.mock.restore();
    await apiApp.close();
    await resetSqlForTests();
    if (previousEnv.plannerEnabled === undefined) delete process.env.CHAT_PLANNER_ENABLED;
    else process.env.CHAT_PLANNER_ENABLED = previousEnv.plannerEnabled;
    if (previousEnv.plannerProvider === undefined) delete process.env.CHAT_FAST_PLANNER_PROVIDER;
    else process.env.CHAT_FAST_PLANNER_PROVIDER = previousEnv.plannerProvider;
    if (previousEnv.plannerApiKey === undefined) delete process.env.CHAT_FAST_PLANNER_API_KEY;
    else process.env.CHAT_FAST_PLANNER_API_KEY = previousEnv.plannerApiKey;
    if (previousEnv.kimiEnabled === undefined) delete process.env.KIMI_WEB_SEARCH_ENABLED;
    else process.env.KIMI_WEB_SEARCH_ENABLED = previousEnv.kimiEnabled;
    if (previousEnv.kimiApiKey === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = previousEnv.kimiApiKey;
    if (previousEnv.deepSeekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousEnv.deepSeekApiKey;
  }
});
```

`assemble-chat-context.test.ts` 已有 `assembleChatContext can skip decision-disabled vector retrieval`，阶段 4 需要确认它仍然通过，用来证明 `includeChatMemory=false` 和 `includePersonaKnowledge=false` 时 service 层不会查 memory/persona vector。

### 6.4 Subagent 验收标准

- 测试没有重新引入关键词 hard guard。
- 测试覆盖多工具组合，而不是只测单一搜索。
- 测试说明了 fixture 的边界：它验证后端行为，不伪装成模型质量评测。

## 7. 阶段 5：全量验证、文档、提交

### 7.1 验证命令

本阶段至少运行：

```bash
pnpm --filter @hall-of-fame/api test -- src/services/minimax-planner/chat-planner.test.ts src/services/minimax-planner/fast-planner-client.test.ts src/services/minimax-planner/tool-plan-trace.test.ts
pnpm --filter @hall-of-fame/api test -- src/chat-trace.test.ts src/services/chat-memory/assemble-chat-context.test.ts
pnpm --filter @hall-of-fame/api typecheck
```

如果时间允许，再运行：

```bash
pnpm --filter @hall-of-fame/api test
pnpm typecheck
```

### 7.2 开发记录

提交前更新 `docs/project-evolution-timeline.md`，记录：

- 移除 hard guard 的原因。
- planner 新语义：自主判断上下文依赖。
- trace 新增事件。
- 跑过的测试命令和结果。
- 已知风险：真实模型是否稳定选择工具，需要继续用 trace 回放观察。

### 7.3 提交

提交信息：

```bash
git commit -m "refactor: let chat planner own tool decisions"
```

## 8. 主要风险与控制

| 风险 | 影响 | 控制方式 |
| --- | --- | --- |
| planner 漏搜 | 最新信息可能不查 web | trace 回放观察；prompt 强调可靠性，不用 hard guard 覆盖 |
| planner 误搜 | 普通聊天变慢 | fixture 覆盖 direct；trace 统计 `requestedTools` |
| prompt 太松导致 JSON 不稳 | planner parse 失败增加 | 保留现有 JSON schema 和 parser；fallback 仅异常路径生效 |
| 删除 hard guard 后 proactive 被滥用 | 后台主动任务误创建 | route 继续保留 `isExplicitProactiveRequest` 二次保护 |
| `chats.ts` 继续膨胀 | 后续维护困难 | 工具计划字段放入独立 helper |
| planner disabled 被误认为自主判断 | 开发或排查时看错链路 | trace 明确 `plannerStatus=disabled`、`fallbackUsed=false`、`plannerDecisionSource=null` |
| Kimi unavailable web context 被误判为搜索结果已使用 | trace 误导排查 | 用 `sanitized.used` 记录 `webSearchResultUsed`，不用 `Boolean(webContext)` |

## 9. 完成定义

- 正常 planner 成功路径没有 hard guard 或等价关键词覆盖。
- planner prompt 改为“上下文依赖判断”，不是“关键词规则路由”。
- trace 能看到 planner 决策、最终工具计划、实际执行结果。
- 目标测试和 typecheck 通过。
- subagent 对计划和每阶段实现均给出通过结论。
- 开发记录已更新，提交已创建。
