import assert from "node:assert/strict";
import { test } from "node:test";

import { __internal, isExplicitProactiveRequest } from "./chat-planner.js";

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

test("planner prompt makes context lookup a model decision", () => {
  const prompt = __internal.buildPlannerSystemPrompt();

  assert.match(prompt, /判断当前问题是否需要历史上下文/);
  assert.match(prompt, /名字、外号、偏好/);
  assert.match(prompt, /先调用 get_chat_context 或 search_chat_memory/);
  assert.match(prompt, /contextUsed/);
});
