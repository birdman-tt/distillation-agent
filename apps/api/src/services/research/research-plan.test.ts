import assert from "node:assert/strict";
import test from "node:test";

import { normalizeResearchPlan } from "./research-plan.js";

const personaContext = {
  displayName: "罗永浩",
  previewIntro: "锋利、理想主义，也不怕把话说重。",
  profileSummary: "重审美、产品尊严和对伪需求的拆解。",
};

const runtimeContext = {
  nowIso: "2026-04-27T10:00:00.000+08:00",
  dateLabel: "2026年4月27日星期一",
  timezone: "Asia/Shanghai",
  currentYear: 2026,
};

test("normalizeResearchPlan fills persona subject and executable query for second-person fresh questions", () => {
  const result = normalizeResearchPlan({
    needWebSearch: true,
    webSearchQuery: "你最近的访谈邀请的是谁",
    researchPlan: {
      subject: null,
      subjectType: "unknown",
      normalizedQuestion: "最近一次访谈邀请的嘉宾是谁",
      searchQueries: ["你最近的访谈邀请的是谁"],
      freshnessRequirement: "latest_available",
      timeWindow: "recent",
      evidenceRequirement: {
        minSources: 1,
        requireUrl: true,
      },
      ifNoReliableSource: "say_not_found_do_not_guess",
      asOf: null,
      timezone: null,
      currentYear: null,
    },
    personaContext,
    runtimeContext,
    userMessage: "你最近的访谈邀请的是谁？我没看，你告诉我",
  });

  assert.equal(result.researchPlan?.subject, "罗永浩");
  assert.equal(result.researchPlan?.subjectType, "persona");
  assert.deepEqual(result.researchPlan?.searchQueries, ["罗永浩 最近 访谈 嘉宾 2026"]);
  assert.equal(result.researchPlan?.asOf, runtimeContext.nowIso);
  assert.equal(result.researchPlan?.timezone, "Asia/Shanghai");
  assert.equal(result.researchPlan?.currentYear, 2026);
  assert.equal(result.webSearchQuery, "罗永浩 最近 访谈 嘉宾 2026");
});

test("normalizeResearchPlan compresses fallback interview queries instead of passing chatty user text to search", () => {
  const result = normalizeResearchPlan({
    needWebSearch: true,
    webSearchQuery: "你最近的访谈节目请了谁？我忘了看了 你给我说一下",
    researchPlan: null,
    personaContext,
    runtimeContext,
    userMessage: "你最近的访谈节目请了谁？我忘了看了 你给我说一下",
  });

  assert.deepEqual(result.researchPlan?.searchQueries, ["罗永浩 最近 访谈 嘉宾 2026"]);
  assert.equal(result.researchPlan?.normalizedQuestion, "最近一次访谈节目的嘉宾是谁");
});

test("normalizeResearchPlan creates fallback plan when planner only returns webSearchQuery", () => {
  const result = normalizeResearchPlan({
    needWebSearch: true,
    webSearchQuery: "罗永浩 最新访谈 嘉宾",
    researchPlan: null,
    personaContext,
    runtimeContext,
    userMessage: "你最近访谈谁了？",
  });

  assert.equal(result.researchPlan?.subject, "罗永浩");
  assert.equal(result.researchPlan?.subjectType, "persona");
  assert.equal(result.researchPlan?.normalizedQuestion, "最近一次访谈节目的嘉宾是谁");
  assert.deepEqual(result.researchPlan?.searchQueries, ["罗永浩 最近 访谈 嘉宾 2026"]);
});
