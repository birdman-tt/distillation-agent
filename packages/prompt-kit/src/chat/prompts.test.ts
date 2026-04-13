import assert from "node:assert/strict";
import test from "node:test";

import { buildChatSystemPrompt } from "./prompts.js";

test("chat system prompt explicitly requires JSON output for structured responses", () => {
  const prompt = buildChatSystemPrompt({
    displayName: "测试对象",
    previewIntro: "一个克制的人物画像",
    profileSummary: "重判断，轻表演。",
    styleExamples: ["我会先看证据，再决定表达强度。"],
    requiredInferenceLevel: "grounded",
  });

  assert.match(prompt, /json/i);
  assert.match(prompt, /answer/);
  assert.match(prompt, /basisSummary/);
  assert.match(prompt, /inferenceLevel/);
  assert.match(prompt, /conflictDetected/);
  assert.match(prompt, /refusalReason/);
});
