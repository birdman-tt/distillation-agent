import assert from "node:assert/strict";
import test from "node:test";

import { buildDistillSystemPrompt } from "./prompts.js";

test("distill system prompt explicitly requires JSON output for structured responses", () => {
  const prompt = buildDistillSystemPrompt();
  assert.match(prompt, /json/i);
  assert.match(prompt, /profile/);
  assert.match(prompt, /preview/);
  assert.match(prompt, /scores/);
});
