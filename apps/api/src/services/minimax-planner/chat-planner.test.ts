import assert from "node:assert/strict";
import { test } from "node:test";

import { __internal, isExplicitProactiveRequest, shouldRunChatPlannerForTurn } from "./chat-planner.js";

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

test("planner prompt makes tool selection a lightweight model decision", () => {
  const prompt = __internal.buildPlannerSystemPrompt();

  assert.match(prompt, /每一轮都要判断/);
  assert.match(prompt, /只做工具选择决策/);
  assert.match(prompt, /不要调用工具/);
  assert.match(prompt, /needChatMemory/);
  assert.match(prompt, /needPersonaKnowledge/);
  assert.match(prompt, /contextUsed/);
  assert.match(prompt, /needWebSearch/);
  assert.match(prompt, /webSearchQuery/);
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

test("planner hard guard overrides missed fresh-info decisions", () => {
  const decision = __internal.applyHardGuardOverrides({
    content: "这个月是几月份 ？几几年？还有你对尚界z7怎么看",
    plan: {
      decisionSource: "fast_planner",
      userIntent: "Fast planner compact decision",
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
      responseOutline: [],
      shouldSendMultipleMessages: false,
      suggestedMessageCount: 1,
      avoidRepeating: [],
      proactiveCandidate: {
        shouldSchedule: false,
        delaySeconds: null,
        topic: null,
        reason: null,
      },
    },
  });

  assert.equal(decision.plan.replyMode, "FACT");
  assert.equal(decision.plan.personaIntensity, "medium");
  assert.equal(decision.plan.needWebSearch, true);
  assert.equal(decision.plan.needPersonaKnowledge, true);
  assert.match(decision.plan.webSearchQuery ?? "", /尚界z7/i);
  assert.equal(decision.applied, true);
});

test("planner hard guard replaces stale model-generated web search query for fresh-info requests", () => {
  const content = "这个月是几月份 ？几几年？还有你对尚界z7怎么看";
  const decision = __internal.applyHardGuardOverrides({
    content,
    plan: {
      decisionSource: "fast_planner",
      userIntent: "Fast planner compact decision",
      replyMode: "FACT",
      personaIntensity: "medium",
      answerMode: "fresh_info",
      retrievalHints: {
        focusQueries: ["2025年6月 尚界Z7 评价"],
        boostScopes: [],
      },
      needChatMemory: false,
      needPersonaKnowledge: false,
      needWebSearch: true,
      webSearchQuery: "2025年6月 尚界Z7 评价",
      webSearchReason: "Fast planner requested web search.",
      researchPlan: null,
      contextUsed: [],
      replyGoal: "自然回应",
      responseOutline: [],
      shouldSendMultipleMessages: false,
      suggestedMessageCount: 1,
      avoidRepeating: [],
      proactiveCandidate: {
        shouldSchedule: false,
        delaySeconds: null,
        topic: null,
        reason: null,
      },
    },
  });

  assert.equal(decision.plan.webSearchQuery, content);
  assert.deepEqual(decision.plan.retrievalHints.focusQueries[0], content);
});
