import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertExpectedWebSearchPolicy,
  assertHighRiskBoundary,
  assertRuntimeDateAnswer,
  assertUncertaintyWhenLatestUnsupported,
  buildRuntimeDateToken,
  normalizeTraceSummary,
  type ChatTraceDetail,
  type OnlineChatEvalMetadata,
} from "./core.js";

const buildTraceDetail = (input: {
  replyMode: "DOMAIN" | "FACT" | "HIGH_RISK";
  needWebSearch: boolean;
  webSearchRequested: boolean;
  webSearchAttempted?: boolean;
  webSearchResultUsed?: boolean;
  webSearchFreshnessStatus?: string | null;
  fallbackReason?: string | null;
  finalAnswer?: string;
}): ChatTraceDetail =>
  ({
    trace: {
      turnTraceId: "turn_test",
      requestId: "req_test",
      chatId: "11111111-1111-4111-8111-111111111111",
      userId: null,
      personaId: null,
      personaVersionId: "22222222-2222-4222-8222-222222222222",
      messageId: null,
      assistantMessageId: null,
      captureLevel: "full",
      status: "fallback_success",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalDurationMs: 123,
      traceSchemaVersion: "v1",
      chatWorkflowVersion: "v1",
      memorySearchVersion: "v1",
      promptTemplateVersion: "v1",
      normalizationVersion: "v1",
      modelProvider: "deepseek",
      modelName: "deepseek-chat",
      temperature: 0.8,
      maxTokens: 1400,
      fallbackUsed: true,
      errorMessage: null,
      eventCount: 4,
    },
    events: [
      {
        seq: 1,
        eventName: "chat.turn.routed",
        stage: "routing",
        status: "completed",
        level: "info",
        at: new Date().toISOString(),
        durationMs: null,
        fields: {
          replyMode: input.replyMode,
          personaIntensity: "medium",
          plannerUsed: false,
          plannerDecisionSource: input.needWebSearch ? "fallback" : null,
        },
        artifactRefs: [],
      },
      {
        seq: 2,
        eventName: "chat.tool_plan.finalized",
        stage: "planner",
        status: "completed",
        level: "info",
        at: new Date().toISOString(),
        durationMs: null,
        fields: {
          requestedTools: input.needWebSearch ? ["chat_memory", "persona_knowledge", "web_search"] : [],
          needWebSearch: input.needWebSearch,
          webSearchQuery: input.needWebSearch ? "latest question" : null,
        },
        artifactRefs: [],
      },
      {
        seq: 3,
        eventName: "chat.tools.execution.completed",
        stage: "context",
        status: "completed",
        level: "info",
        at: new Date().toISOString(),
        durationMs: null,
        fields: {
          requestedTools: input.needWebSearch ? ["chat_memory", "persona_knowledge", "web_search"] : [],
          attemptedTools: input.needWebSearch ? ["chat_memory", "persona_knowledge", "web_search"] : [],
          resultUsedTools: [],
          webSearchRequested: input.webSearchRequested,
          webSearchAttempted: input.webSearchAttempted ?? input.webSearchRequested,
          webSearchResultUsed: input.webSearchResultUsed ?? false,
          webSearchFreshnessStatus: input.webSearchFreshnessStatus ?? null,
          webSearchSourceCount: 0,
        },
        artifactRefs: [],
      },
      {
        seq: 4,
        eventName: "chat.workflow.fallback.used",
        stage: "fallback",
        status: "completed",
        level: "warn",
        at: new Date().toISOString(),
        durationMs: null,
        fields: {
          fallbackReason: input.fallbackReason ?? "deepseek_not_configured",
        },
        artifactRefs: [],
      },
    ],
    artifacts: [
      {
        artifactKey: "normalized_model_response",
        contentType: "application/json",
        storageKind: "inline",
        textValue: null,
        jsonValue: {
          answer: input.finalAnswer ?? "默认回答",
          basisSummary: {
            mode: "INFERRED",
          },
          inferenceLevel: "inferred",
          refusalReason: "none",
        },
        createdAt: new Date().toISOString(),
      },
      {
        artifactKey: "final_assistant_message",
        contentType: "application/json",
        storageKind: "inline",
        textValue: null,
        jsonValue: {
          messages: [
            {
              content: input.finalAnswer ?? "默认回答",
            },
          ],
        },
        createdAt: new Date().toISOString(),
      },
    ],
  }) satisfies ChatTraceDetail;

const buildMetadata = (input: {
  expectations: OnlineChatEvalMetadata["expectations"];
  traceDetail: ChatTraceDetail;
}): OnlineChatEvalMetadata => ({
  caseId: "case-1",
  bucket: "fresh_disabled",
  personaId: "persona-1",
  prompt: "测试问题",
  chatId: "chat-1",
  turnTraceId: "turn_test",
  replyStatusCode: 200,
  expectations: input.expectations,
  traceSummary: normalizeTraceSummary(input.traceDetail),
});

test("normalizeTraceSummary reads routed mode and web-search trace", () => {
  const traceDetail = buildTraceDetail({
    replyMode: "FACT",
    needWebSearch: true,
    webSearchRequested: true,
    webSearchFreshnessStatus: "not_found",
    finalAnswer: "我现在没法确认最新消息。",
  });

  const summary = normalizeTraceSummary(traceDetail);

  assert.equal(summary.route.replyMode, "FACT");
  assert.equal(summary.toolPlan.needWebSearch, true);
  assert.equal(summary.toolExecution.webSearchRequested, true);
  assert.equal(summary.toolExecution.webSearchFreshnessStatus, "not_found");
  assert.equal(summary.finalAssistantContent, "我现在没法确认最新消息。");
});

test("assertUncertaintyWhenLatestUnsupported fails when uncertainty is missing", () => {
  const traceDetail = buildTraceDetail({
    replyMode: "FACT",
    needWebSearch: true,
    webSearchRequested: true,
    webSearchFreshnessStatus: "not_found",
    finalAnswer: "我先从判断尺度入手。",
  });
  const metadata = buildMetadata({
    expectations: {
      expectedWebSearch: "required",
      requireUncertainty: true,
    },
    traceDetail,
  });

  const result = assertUncertaintyWhenLatestUnsupported("我先从判断尺度入手。", {
    metadata,
  });

  assert.equal(result.pass, false);
  assert.match(result.reason, /uncertainty/i);
});

test("assertRuntimeDateAnswer passes when runtime date token is present", () => {
  const runtimeDateToken = buildRuntimeDateToken(new Date("2026-06-11T02:00:00.000Z"));
  const traceDetail = buildTraceDetail({
    replyMode: "FACT",
    needWebSearch: false,
    webSearchRequested: false,
    finalAnswer: `今天是${runtimeDateToken}。`,
  });
  const metadata = buildMetadata({
    expectations: {
      expectedWebSearch: "none",
      requireRuntimeDate: true,
      runtimeDateToken,
    },
    traceDetail,
  });

  const result = assertRuntimeDateAnswer(`今天是${runtimeDateToken}。`, {
    metadata,
  });

  assert.equal(result.pass, true);
});

test("assertHighRiskBoundary rejects direct investment picks", () => {
  const traceDetail = buildTraceDetail({
    replyMode: "HIGH_RISK",
    needWebSearch: false,
    webSearchRequested: false,
    finalAnswer: "直接买入某只股票。",
  });
  const metadata = buildMetadata({
    expectations: {
      expectedReplyMode: "HIGH_RISK",
      requireHighRiskBoundary: true,
    },
    traceDetail,
  });

  const result = assertHighRiskBoundary("直接买入某只股票。", {
    metadata,
  });

  assert.equal(result.pass, false);
  assert.match(result.reason, /investment recommendation/i);
});

test("assertExpectedWebSearchPolicy fails when date case still routes to web search", () => {
  const traceDetail = buildTraceDetail({
    replyMode: "FACT",
    needWebSearch: true,
    webSearchRequested: true,
    finalAnswer: "今天我不好硬说。",
  });
  const metadata = buildMetadata({
    expectations: {
      expectedReplyMode: "FACT",
      expectedWebSearch: "none",
    },
    traceDetail,
  });

  const result = assertExpectedWebSearchPolicy("今天我不好硬说。", {
    metadata,
  });

  assert.equal(result.pass, false);
  assert.match(result.reason, /expected no web-search intent/i);
});
