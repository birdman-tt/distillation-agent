import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { FastPlannerNotConfiguredError, runFastPlannerDecision } from "./fast-planner-client.js";

test("Fast planner sends non-thinking compact JSON request without tools", async () => {
  const requests: unknown[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                m: 2,
                i: 1,
                cm: false,
                pk: false,
                ws: true,
                q: "尚界Z7 最新信息",
                pro: false,
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runFastPlannerDecision({
      provider: "deepseek",
      apiKey: "deepseek-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      systemPrompt: "return json",
      userPrompt: "今天尚界Z7怎么样？",
    });

    assert.equal(result.plan.decisionSource, "fast_planner");
    assert.equal(result.plan.replyMode, "FACT");
    assert.equal(result.plan.personaIntensity, "medium");
    assert.equal(result.plan.needWebSearch, true);
    assert.equal(result.plan.webSearchQuery, "尚界Z7 最新信息");

    assert.equal(requests.length, 1);
    const body = requests[0] as Record<string, unknown>;
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.temperature, 0);
    assert.equal("tools" in body, false);
    assert.equal("tool_choice" in body, false);
  } finally {
    fetchMock.mock.restore();
  }
});

test("Fast planner strips thinking blocks and fenced JSON before parsing", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '<think>判断用户问自己的名字，需要查聊天记忆</think>\n```json\n{"m":2,"i":1,"cm":true,"pk":false,"ws":false,"q":null,"pro":false}\n```',
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runFastPlannerDecision({
      provider: "kimi",
      apiKey: "kimi-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      systemPrompt: "return json",
      userPrompt: "我叫什么？",
    });

    assert.equal(result.plan.needChatMemory, true);
    assert.equal(result.plan.needWebSearch, false);
    assert.equal(result.plan.decisionSource, "fast_planner");
  } finally {
    fetchMock.mock.restore();
  }
});

test("Fast planner parses compact research plan for web search turns", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                m: 2,
                i: 1,
                cm: true,
                pk: true,
                ws: true,
                q: "罗永浩 最近 访谈 嘉宾 2026",
                rp: {
                  s: "罗永浩",
                  st: "persona",
                  nq: "最近一次访谈邀请的嘉宾是谁",
                  qs: ["罗永浩 最近 访谈 嘉宾 2026", "罗永浩 最新访谈 嘉宾"],
                  fr: "latest_available",
                  tw: "recent",
                  nf: "say_not_found_do_not_guess",
                },
                pro: false,
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runFastPlannerDecision({
      provider: "deepseek",
      apiKey: "deepseek-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      systemPrompt: "return json",
      userPrompt: "你最近的访谈邀请的是谁？",
    });

    assert.equal(result.plan.needWebSearch, true);
    assert.equal(result.plan.webSearchQuery, "罗永浩 最近 访谈 嘉宾 2026");
    assert.equal(result.plan.researchPlan?.subject, "罗永浩");
    assert.equal(result.plan.researchPlan?.subjectType, "persona");
    assert.equal(result.plan.researchPlan?.normalizedQuestion, "最近一次访谈邀请的嘉宾是谁");
    assert.deepEqual(result.plan.researchPlan?.searchQueries, [
      "罗永浩 最近 访谈 嘉宾 2026",
      "罗永浩 最新访谈 嘉宾",
    ]);
    assert.equal(result.plan.researchPlan?.freshnessRequirement, "latest_available");
    assert.equal(result.plan.researchPlan?.timeWindow, "recent");
    assert.equal(result.plan.researchPlan?.ifNoReliableSource, "say_not_found_do_not_guess");
  } finally {
    fetchMock.mock.restore();
  }
});

test("Fast planner requires provider API key", async () => {
  await assert.rejects(
    runFastPlannerDecision({
      provider: "deepseek",
      apiKey: "",
      model: "deepseek-v4-flash",
      systemPrompt: "return json",
      userPrompt: "你好",
    }),
    FastPlannerNotConfiguredError,
  );
});
