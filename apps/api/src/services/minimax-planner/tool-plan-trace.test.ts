import assert from "node:assert/strict";
import test from "node:test";

import { buildRequestedPlannerTools, buildToolExecutionTrace } from "./tool-plan-trace.js";

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
    webSearchFreshnessStatus: "unavailable",
    webSearchSourceCount: 0,
    proactiveRequested: false,
    proactiveOutcome: "not_requested",
  });

  assert.deepEqual(trace.requestedTools, ["chat_memory", "persona_knowledge", "web_search"]);
  assert.deepEqual(trace.attemptedTools, ["chat_memory", "persona_knowledge", "web_search"]);
  assert.deepEqual(trace.resultUsedTools, ["chat_memory"]);
  assert.equal(trace.webSearchResultUsed, false);
  assert.equal(trace.webSearchFreshnessStatus, "unavailable");
  assert.equal(trace.webSearchSourceCount, 0);
});
