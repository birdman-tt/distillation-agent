import assert from "node:assert/strict";
import test from "node:test";

import { runKimiResearcher } from "./kimi-researcher.js";

test("runKimiResearcher calls AnySearch and returns WebContext", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown>; signal: AbortSignal | undefined }> = [];
  const abortController = new AbortController();
  const webContext = await runKimiResearcher(
    {
      userMessage: "今天 OpenAI 有什么最新消息？",
      webSearchQuery: "OpenAI latest news today",
      plannerReason: "用户询问最新消息",
      locale: "zh-CN",
      maxFindings: 3,
    },
    {
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push({ url: String(url), body, signal: init?.signal as AbortSignal | undefined });

        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: {
              results: [
                {
                  title: "OpenAI News",
                  url: "https://openai.com/news/",
                  snippet: "latest",
                  content: "OpenAI 发布了一条新消息。",
                },
              ],
              metadata: {
                request_id: "req_abc123",
                total_results: 1,
                search_time_ms: 342,
              },
            },
          }),
          { status: 200 },
        );
      },
      signal: abortController.signal,
    },
  );

  assert.equal(webContext.freshnessStatus, "fresh");
  assert.equal(webContext.sources[0]?.url, "https://openai.com/news/");
  assert.equal(webContext.keyFindings[0], "OpenAI 发布了一条新消息。");
  assert.equal(requests[0]?.url, "https://api.anysearch.com/v1/search");
  assert.equal(requests[0]?.body.query, "OpenAI latest news today");
  assert.equal(requests[0]?.body.max_results, 3);
  assert.equal(requests[0]?.body.language, "zh-CN");
  assert.equal(requests[0]?.body.zone, "cn");
  assert.equal(requests[0]?.signal, abortController.signal);
});

test("runKimiResearcher returns not_found when AnySearch returns empty results", async () => {
  const webContext = await runKimiResearcher(
    {
      userMessage: "今天 OpenAI 有什么最新消息？",
      webSearchQuery: "OpenAI latest news today",
      plannerReason: "用户询问最新消息",
      locale: "zh-CN",
      maxFindings: 3,
    },
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: {
              results: [],
              metadata: {
                request_id: "req_abc123",
                total_results: 0,
                search_time_ms: 120,
              },
            },
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(webContext.freshnessStatus, "not_found");
  assert.equal(webContext.sources.length, 0);
  assert.ok(webContext.uncertainty?.includes("未查到可靠来源"));
});

test("runKimiResearcher sends research plan query instead of raw user message", async () => {
  const requests: Array<Record<string, unknown>> = [];
  await runKimiResearcher(
    {
      userMessage: "你最近的访谈邀请的是谁？",
      researchPlan: {
        subject: "罗永浩",
        subjectType: "persona",
        normalizedQuestion: "最近一次访谈邀请的嘉宾是谁",
        searchQueries: ["罗永浩 最近 访谈 嘉宾 2026", "罗永浩 最新访谈 嘉宾"],
        freshnessRequirement: "latest_available",
        timeWindow: "recent",
        evidenceRequirement: {
          minSources: 1,
          requireUrl: true,
        },
        ifNoReliableSource: "say_not_found_do_not_guess",
        asOf: "2026-04-27T10:00:00.000+08:00",
        timezone: "Asia/Shanghai",
        currentYear: 2026,
      },
      plannerReason: "planner requested fresh information",
      locale: "zh-CN",
      maxFindings: 3,
    },
    {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push(body);
        return new Response(
          JSON.stringify({
            code: 0,
            message: "success",
            data: {
              results: [],
              metadata: {
                request_id: "req_abc123",
                total_results: 0,
                search_time_ms: 120,
              },
            },
          }),
          { status: 200 },
        );
      },
    },
  );

  assert.equal(requests[0]?.query, "罗永浩 最近 访谈 嘉宾 2026");
});

test("runKimiResearcher throws on AnySearch error response", async () => {
  await assert.rejects(
    runKimiResearcher(
      {
        userMessage: "test",
        plannerReason: "test",
        locale: "zh-CN",
        maxFindings: 3,
      },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ code: 1, message: "invalid request", data: { results: [], metadata: { request_id: "", total_results: 0, search_time_ms: 0 } } }),
            { status: 200 },
          ),
      },
    ),
    /AnySearch error: invalid request/,
  );
});

test("runKimiResearcher throws on HTTP error", async () => {
  await assert.rejects(
    runKimiResearcher(
      {
        userMessage: "test",
        plannerReason: "test",
        locale: "zh-CN",
        maxFindings: 3,
      },
      {
        fetchImpl: async () => new Response("Internal Server Error", { status: 500 }),
      },
    ),
    /AnySearch request failed with 500/,
  );
});
