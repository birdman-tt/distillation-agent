import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceCandidatesFromWebContext,
  createBucketCoverage,
  buildDiscoveryQualityWarnings,
  detectSourceRiskFlags,
  inferBucketFromSource,
} from "./distill-source-discovery.js";

const hashValue = (value: string) => `hash:${value}`;

test("buildSourceCandidatesFromWebContext filters invalid and duplicate URLs", () => {
  let id = 0;
  const candidates = buildSourceCandidatesFromWebContext({
    normalizedName: "纪晓岚",
    createSourceCandidateId: () => `source-${(id += 1)}`,
    hashValue,
    sources: [
      {
        title: "纪晓岚 官方访谈",
        url: "https://example.com/interview",
        snippet: "访谈材料",
      },
      {
        title: "重复链接",
        url: "https://example.com/interview",
        snippet: "重复材料",
      },
      {
        title: "无效链接",
        url: "not-a-url",
        snippet: "应该被跳过",
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.sourceCandidateId, "source-1");
  assert.equal(candidates[0]?.publisher, "example.com");
  assert.equal(candidates[0]?.normalizedUrlHash, "hash:https://example.com/interview");
});

test("buildSourceCandidatesFromWebContext classifies usable search results", () => {
  const candidates = buildSourceCandidatesFromWebContext({
    normalizedName: "纪晓岚",
    createSourceCandidateId: () => "source-1",
    hashValue,
    sources: [
      {
        title: "纪晓岚 官方采访原文",
        url: "https://people.example.com/article",
        snippet: "官方采访原文，包含说话方式和观点。",
        publishedAt: "2026-05-01",
      },
    ],
  });

  assert.equal(candidates[0]?.bucket, "CONVERSATIONS");
  assert.equal(candidates[0]?.sourceKind, "PRIMARY");
  assert.equal(candidates[0]?.trustLevel, "HIGH");
  assert.equal(candidates[0]?.recommended, true);
  assert.equal(candidates[0]?.publishedAt, "2026-05-01");
});

test("risk flags make candidates non-recommended", () => {
  const candidates = buildSourceCandidatesFromWebContext({
    normalizedName: "测试对象",
    createSourceCandidateId: () => "source-1",
    hashValue,
    sources: [
      {
        title: "网传爆料",
        url: "https://news.example.com/a",
        snippet: "未经证实的诈骗传闻。",
      },
    ],
  });

  assert.deepEqual(detectSourceRiskFlags("网传爆料", "未经证实的诈骗传闻。"), [
    "risk_sensitive_content",
    "risk_unverified_claim",
  ]);
  assert.equal(candidates[0]?.recommended, false);
});

test("bucket helpers keep the expected evidence coverage shape", () => {
  assert.equal(inferBucketFromSource("人物生平", "完整时间线"), "TIMELINE");
  const coverage = createBucketCoverage([{ bucket: "WRITINGS" }, { bucket: "WRITINGS" }, { bucket: "TIMELINE" }]);

  assert.equal(coverage.WRITINGS, 2);
  assert.equal(coverage.TIMELINE, 1);
  assert.equal(coverage.CONVERSATIONS, 0);
});

test("quality warning helper preserves existing warnings and adds low coverage warning", () => {
  const warnings = buildDiscoveryQualityWarnings({
    existingWarnings: ["外部搜索暂不可用。"],
    missingBuckets: ["CONVERSATIONS", "EXPRESSION_DNA", "EXTERNAL_VIEWS"],
  });

  assert.deepEqual(warnings, ["外部搜索暂不可用。", "当前资料覆盖偏窄，建议用户补充原始资料。"]);
});
