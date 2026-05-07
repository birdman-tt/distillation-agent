import assert from "node:assert/strict";
import test from "node:test";

import { runKimiResearcher } from "./kimi-researcher.js";

test("runKimiResearcher executes Kimi web search tool loop and returns WebContext", async () => {
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
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      maxToolCalls: 2,
      signal: abortController.signal,
      fetchImpl: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push({ url: String(url), body, signal: init?.signal as AbortSignal | undefined });

        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call-1",
                        type: "function",
                        function: {
                          name: "$web_search",
                          arguments: "{\"query\":\"OpenAI latest news today\"}",
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    query: "OpenAI latest news today",
                    freshnessStatus: "fresh",
                    keyFindings: ["OpenAI 发布了一条新消息。"],
                    sources: [
                      {
                        title: "OpenAI News",
                        url: "https://openai.com/news/",
                        publishedAt: null,
                        snippet: "latest",
                      },
                    ],
                    uncertainty: null,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  );

  assert.equal(webContext.freshnessStatus, "fresh");
  assert.equal(webContext.sources[0]?.url, "https://openai.com/news/");
  assert.equal(requests[0]?.url, "https://api.moonshot.cn/v1/chat/completions");
  assert.equal(requests[0]?.body.temperature, 0.6);
  assert.deepEqual(requests[0]?.body.thinking, { type: "disabled" });
  assert.deepEqual(requests[0]?.body.tools, [
    {
      type: "builtin_function",
      function: {
        name: "$web_search",
      },
    },
  ]);
  assert.equal(requests[0]?.signal, abortController.signal);
  const secondMessages = requests[1]?.body.messages as Array<{ role: string; content?: string }>;
  assert.equal(secondMessages.at(-1)?.role, "tool");
  assert.equal(secondMessages.at(-1)?.content, "{\"query\":\"OpenAI latest news today\"}");
});

test("runKimiResearcher normalizes object findings from real model responses", async () => {
  const webContext = await runKimiResearcher(
    {
      userMessage: "今天 OpenAI 有什么最新消息？",
      webSearchQuery: "OpenAI latest news today",
      plannerReason: "用户询问最新消息",
      locale: "zh-CN",
      maxFindings: 3,
    },
    {
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      maxToolCalls: 1,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    query: "OpenAI latest news today",
                    freshnessStatus: "fresh",
                    keyFindings: [
                      {
                        summary: "OpenAI 发布了一条新消息。",
                        source: "OpenAI News",
                      },
                    ],
                    sources: [
                      {
                        title: "OpenAI News",
                        url: "https://openai.com/news/",
                      },
                    ],
                    uncertainty: null,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    },
  );

  assert.deepEqual(webContext.keyFindings, ['{"summary":"OpenAI 发布了一条新消息。","source":"OpenAI News"}']);
  assert.equal(webContext.sources[0]?.publishedAt, null);
});

test("runKimiResearcher sends research plan instead of an ambiguous raw user query", async () => {
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
      apiKey: "test-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      maxToolCalls: 1,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push(body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    query: "罗永浩 最近 访谈 嘉宾 2026",
                    freshnessStatus: "not_found",
                    keyFindings: ["没有找到可靠来源。"],
                    sources: [],
                    uncertainty: "没有可靠来源。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  );

  const messages = requests[0]?.messages as Array<{ role: string; content: string }>;
  const userPrompt = messages.find((message) => message.role === "user")?.content ?? "";
  assert.match(userPrompt, /subject=罗永浩/);
  assert.match(userPrompt, /normalizedQuestion=最近一次访谈邀请的嘉宾是谁/);
  assert.match(userPrompt, /罗永浩 最近 访谈 嘉宾 2026/);
  assert.doesNotMatch(userPrompt, /\[Web Search Query\]\n\n你最近/);
});
