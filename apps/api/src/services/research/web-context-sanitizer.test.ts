import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeWebContext } from "./web-context-sanitizer.js";

const researchPlan = {
  subject: "罗永浩",
  subjectType: "persona" as const,
  normalizedQuestion: "最近一次访谈邀请的嘉宾是谁",
  searchQueries: ["罗永浩 最近 访谈 嘉宾 2026"],
  freshnessRequirement: "latest_available" as const,
  timeWindow: "recent" as const,
  evidenceRequirement: {
    minSources: 1,
    requireUrl: true,
  },
  ifNoReliableSource: "say_not_found_do_not_guess" as const,
  asOf: "2026-04-27T10:00:00.000+08:00",
  timezone: "Asia/Shanghai",
  currentYear: 2026,
};

test("sanitizeWebContext keeps fresh sourced findings", () => {
  const result = sanitizeWebContext({
    webContext: {
      query: "罗永浩 最近 访谈 嘉宾 2026",
      freshnessStatus: "fresh",
      keyFindings: ["最近访谈嘉宾是某某。"],
      sources: [
        {
          title: "访谈来源",
          url: "https://example.com/interview",
          publishedAt: null,
          snippet: "嘉宾信息",
        },
      ],
      uncertainty: null,
    },
    researchPlan,
  });

  assert.equal(result.used, true);
  assert.equal(result.webContext.freshnessStatus, "fresh");
  assert.equal(result.webContext.sources.length, 1);
  assert.match(result.webContext.keyFindings[0] ?? "", /最近访谈嘉宾/);
});

test("sanitizeWebContext removes uncertain runtime explanations without reliable sources", () => {
  const result = sanitizeWebContext({
    webContext: {
      query: "你最近的访谈邀请的是谁",
      freshnessStatus: "uncertain",
      keyFindings: ["用户可能把 AI助手 误认为某位具体人物，需要澄清指代不明。"],
      sources: [],
      uncertainty: "用户指代不明。",
    },
    researchPlan,
  });

  assert.equal(result.used, false);
  assert.equal(result.webContext.freshnessStatus, "not_found");
  assert.equal(result.webContext.sources.length, 0);
  assert.deepEqual(result.webContext.keyFindings, ["未查到可靠来源，不能编造最新事实。"]);
  assert.doesNotMatch(JSON.stringify(result.webContext), /AI助手|指代不明/);
});
