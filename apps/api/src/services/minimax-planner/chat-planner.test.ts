import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";

import { ZodError } from "zod";

import { __internal, isExplicitProactiveRequest, runChatPlanner, shouldRunChatPlannerForTurn } from "./chat-planner.js";

test("proactive scheduling requires an explicit user cue", () => {
  assert.equal(isExplicitProactiveRequest("哈哈哈 还真是"), false);
  assert.equal(isExplicitProactiveRequest("稍后提醒我继续聊这个问题"), true);
  assert.equal(isExplicitProactiveRequest("remind me later about this"), true);
});

test("planner failure artifacts include raw response and normalized candidate for parse failures", () => {
  const artifacts = __internal.buildPlannerFailureArtifacts({
    error: {
      name: "MiniMaxPlannerParseError",
      rawResponse: { id: "response-1" },
      parsedCandidate: { contextUsed: "空", proactiveCandidate: false },
      normalizedCandidate: {
        contextUsed: [],
        proactiveCandidate: {
          shouldSchedule: false,
          delaySeconds: null,
          topic: null,
          reason: null,
        },
      },
    },
  });

  assert.deepEqual(
    artifacts.map((artifact) => artifact.artifactKey),
    ["planner_raw_response", "planner_parse_error", "planner_normalized_candidate"],
  );
});

test("planner failure status treats schema validation errors as parse failures", () => {
  assert.equal(__internal.getPlannerFailureStatus(new ZodError([])), "parse_failed");
});

test("planner prompt makes tool selection a lightweight model decision", () => {
  const prompt = __internal.buildPlannerSystemPrompt();

  assert.match(prompt, /每一轮都要判断/);
  assert.match(prompt, /只做工具选择决策/);
  assert.match(prompt, /不要调用工具/);
  assert.match(prompt, /上下文依赖/);
  assert.match(prompt, /不是关键词规则路由器/);
  assert.match(prompt, /可以同时选择多个工具/);
  assert.match(prompt, /needChatMemory/);
  assert.match(prompt, /needPersonaKnowledge/);
  assert.match(prompt, /contextUsed/);
  assert.match(prompt, /needWebSearch/);
  assert.match(prompt, /webSearchQuery/);
  assert.doesNotMatch(prompt, /今天[\s\S]{0,80}needWebSearch[\s\S]{0,40}必须/iu);
  assert.doesNotMatch(prompt, /最新[\s\S]{0,80}needWebSearch[\s\S]{0,40}必须/iu);
  assert.doesNotMatch(prompt, /刚才[\s\S]{0,80}cm\s*=\s*true/iu);
  assert.doesNotMatch(prompt, /提醒[\s\S]{0,80}pro\s*=\s*true/iu);
});

test("planner gate no longer skips ordinary chat before the model decision", () => {
  assert.deepEqual(shouldRunChatPlannerForTurn("你好"), {
    shouldRun: true,
    reason: "every_turn",
  });
  assert.deepEqual(shouldRunChatPlannerForTurn("我叫什么？"), {
    shouldRun: true,
    reason: "every_turn",
  });
});

test("planner gate runs for fresh info, proactive and complex planning requests", () => {
  assert.equal(shouldRunChatPlannerForTurn("今天最新的 AI 新闻是什么？").shouldRun, true);
  assert.equal(shouldRunChatPlannerForTurn("十分钟后提醒我继续聊这个").shouldRun, true);
  assert.equal(shouldRunChatPlannerForTurn("帮我比较这三个方案，给出执行计划").shouldRun, true);
});

test("planner fallback decision catches current-date and product freshness requests", () => {
  const decision = __internal.buildFallbackChatTurnPlan({
    content: "这个月是几月份 ？几几年？还有你对尚界z7怎么看",
    fallbackReplyMode: "CASUAL",
    fallbackPersonaIntensity: "low",
  });

  assert.equal(decision.replyMode, "FACT");
  assert.equal(decision.personaIntensity, "medium");
  assert.equal(decision.needChatMemory, true);
  assert.equal(decision.needPersonaKnowledge, true);
  assert.equal(decision.needWebSearch, true);
  assert.match(decision.webSearchQuery ?? "", /尚界z7/i);
});

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
    if (previousEnv.plannerEnabled === undefined) {
      delete process.env.CHAT_PLANNER_ENABLED;
    } else {
      process.env.CHAT_PLANNER_ENABLED = previousEnv.plannerEnabled;
    }
    if (previousEnv.plannerProvider === undefined) {
      delete process.env.CHAT_FAST_PLANNER_PROVIDER;
    } else {
      process.env.CHAT_FAST_PLANNER_PROVIDER = previousEnv.plannerProvider;
    }
    if (previousEnv.plannerApiKey === undefined) {
      delete process.env.CHAT_FAST_PLANNER_API_KEY;
    } else {
      process.env.CHAT_FAST_PLANNER_API_KEY = previousEnv.plannerApiKey;
    }
    if (previousEnv.plannerTimeout === undefined) {
      delete process.env.CHAT_PLANNER_TIMEOUT_MS;
    } else {
      process.env.CHAT_PLANNER_TIMEOUT_MS = previousEnv.plannerTimeout;
    }
  }
});
