import assert from "node:assert/strict";
import test from "node:test";

import {
  createDistillSourceDiscoveryJobResponseSchema,
  distillSourceDiscoveryJobResponseSchema,
} from "./persona-distill.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const discoveryId = "22222222-2222-4222-8222-222222222222";
const sourceCandidateId = "33333333-3333-4333-8333-333333333333";

const queuedResponse = {
  sourceDiscoveryJobId: uuid,
  intentId: uuid,
  status: "QUEUED",
  currentStep: "准备搜索资料",
  progress: 5,
  discoveryId: null,
  discovery: null,
  error: null,
  nextAction: "POLL_SOURCE_DISCOVERY",
  pollHref: `/v1/persona-distill-source-discovery-jobs/${uuid}`,
};

const succeededDiscovery = {
  discoveryId,
  normalizedName: "纪晓岚",
  entityType: "REAL_PERSON",
  riskDecision: "ALLOW",
  bucketCoverage: {
    WRITINGS: 1,
    CONVERSATIONS: 1,
    EXPRESSION_DNA: 0,
    EXTERNAL_VIEWS: 0,
    DECISIONS: 0,
    TIMELINE: 0,
  },
  sourceCandidates: [
    {
      sourceCandidateId,
      bucket: "WRITINGS",
      title: "纪晓岚公开资料",
      url: "https://example.com/jixiaolan",
      normalizedUrlHash: "hash",
      publisher: "example.com",
      author: null,
      publishedAt: null,
      snippet: "公开资料摘要",
      sourceKind: "SECONDARY",
      trustLevel: "MEDIUM",
      sourceCategory: "media_report",
      isPrimary: false,
      recommended: true,
      recommendationReason: "搜索返回的可追溯公开来源。",
      dedupeKey: "hash",
      riskFlags: [],
    },
  ],
  missingBuckets: ["EXPRESSION_DNA", "EXTERNAL_VIEWS", "DECISIONS", "TIMELINE"],
  qualityWarnings: ["当前资料覆盖偏窄，建议用户补充原始资料。"],
  sanitizerVersion: "web-search-v1",
};

test("source discovery job contract parses queued create response", () => {
  const parsed = createDistillSourceDiscoveryJobResponseSchema.parse(queuedResponse);

  assert.equal(parsed.status, "QUEUED");
  assert.equal(parsed.nextAction, "POLL_SOURCE_DISCOVERY");
  assert.equal(parsed.pollHref, `/v1/persona-distill-source-discovery-jobs/${uuid}`);
});

test("source discovery job contract parses searching response", () => {
  const parsed = distillSourceDiscoveryJobResponseSchema.parse({
    ...queuedResponse,
    status: "SEARCHING",
    currentStep: "搜索公开资料",
    progress: 35,
    pollHref: undefined,
  });

  assert.equal(parsed.status, "SEARCHING");
  assert.equal(parsed.discovery, null);
});

test("source discovery job contract parses succeeded response with discovery", () => {
  const parsed = distillSourceDiscoveryJobResponseSchema.parse({
    ...queuedResponse,
    status: "SUCCEEDED",
    currentStep: "资料已找到",
    progress: 100,
    discoveryId,
    discovery: succeededDiscovery,
    nextAction: "CONFIRM_SOURCES",
    pollHref: undefined,
  });

  assert.equal(parsed.status, "SUCCEEDED");
  assert.equal(parsed.discovery?.sourceCandidates[0]?.recommendationReason, "搜索返回的可追溯公开来源。");
});

test("source discovery job contract parses failed response with provider-neutral retryable error", () => {
  const parsed = distillSourceDiscoveryJobResponseSchema.parse({
    ...queuedResponse,
    status: "FAILED",
    currentStep: "资料搜索失败",
    progress: 100,
    error: {
      code: "SOURCE_SEARCH_BUSY",
      message: "搜索服务繁忙，可以稍后重试",
      retryable: true,
    },
    nextAction: "RETRY_SOURCE_DISCOVERY",
    pollHref: undefined,
  });

  assert.equal(parsed.error?.code, "SOURCE_SEARCH_BUSY");
  assert.equal(parsed.error?.retryable, true);
});

test("source discovery job contract parses blocked response with safe non-retryable error", () => {
  const parsed = distillSourceDiscoveryJobResponseSchema.parse({
    ...queuedResponse,
    status: "BLOCKED",
    currentStep: "当前对象暂不能蒸馏",
    progress: 100,
    error: {
      code: "SOURCE_DISCOVERY_BLOCKED",
      message: "当前对象暂不能创建，请换一个对象。",
      retryable: false,
    },
    nextAction: "SOURCE_DISCOVERY_BLOCKED",
    pollHref: undefined,
  });

  assert.equal(parsed.status, "BLOCKED");
  assert.equal(parsed.error?.retryable, false);
});

test("source discovery job contract rejects succeeded response without discovery", () => {
  assert.throws(() =>
    distillSourceDiscoveryJobResponseSchema.parse({
      ...queuedResponse,
      status: "SUCCEEDED",
      currentStep: "资料已找到",
      progress: 100,
      nextAction: "CONFIRM_SOURCES",
    }),
  );
});

test("create source discovery job response rejects failed job shape", () => {
  assert.throws(() =>
    createDistillSourceDiscoveryJobResponseSchema.parse({
      ...queuedResponse,
      status: "FAILED",
      error: {
        code: "SOURCE_SEARCH_BUSY",
        message: "搜索服务繁忙，可以稍后重试",
        retryable: true,
      },
    }),
  );
});
