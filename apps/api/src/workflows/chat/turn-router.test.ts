import assert from "node:assert/strict";
import { test } from "node:test";

import { routeChatTurn } from "./turn-router.js";

const mungerFocus = ["长期", "判断", "机会", "愚蠢", "投资", "理财", "股票", "商业", "概率", "风险", "决策"];

test("turn router keeps casual mode but leaves context decisions to the planner", () => {
  const routing = routeChatTurn({
    content: "你好",
    focusKeywords: mungerFocus,
  });

  assert.equal(routing.replyMode, "CASUAL");
  assert.equal(routing.personaIntensity, "low");
  assert.deepEqual(Object.keys(routing).sort(), ["personaIntensity", "replyMode"]);
});

test("turn router does not special-case user identity recall", () => {
  const routing = routeChatTurn({
    content: "对了，我叫什么？",
    focusKeywords: mungerFocus,
  });

  assert.equal(routing.replyMode, "CASUAL");
  assert.equal(routing.personaIntensity, "low");
  assert.deepEqual(Object.keys(routing).sort(), ["personaIntensity", "replyMode"]);
});

test("turn router still classifies domain and high-risk voice without choosing context tools", () => {
  const domainRouting = routeChatTurn({
    content: "聊聊投资和股票风险",
    focusKeywords: mungerFocus,
  });
  const highRiskRouting = routeChatTurn({
    content: "这只股票现在该不该重仓买入？",
    focusKeywords: mungerFocus,
  });

  assert.equal(domainRouting.replyMode, "DOMAIN");
  assert.equal(domainRouting.personaIntensity, "high");

  assert.equal(highRiskRouting.replyMode, "HIGH_RISK");
  assert.equal(highRiskRouting.personaIntensity, "medium");
});
