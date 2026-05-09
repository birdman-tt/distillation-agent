import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { buildFastPlannerSystemPrompt, FastPlannerNotConfiguredError, runFastPlannerDecision } from "./fast-planner-client.js";

test("Fast planner prompt frames tool choice as context dependency instead of keyword rules", () => {
  const prompt = buildFastPlannerSystemPrompt();

  assert.match(prompt, /上下文依赖/);
  assert.match(prompt, /不是关键词规则路由器/);
  assert.match(prompt, /不要因为出现单个词就机械选择工具/);
  assert.doesNotMatch(prompt, /规则：/u);
  assert.doesNotMatch(prompt, /今天[\s\S]{0,80}ws\s*=\s*true/iu);
  assert.doesNotMatch(prompt, /刚才[\s\S]{0,80}cm\s*=\s*true/iu);
  assert.doesNotMatch(prompt, /提醒[\s\S]{0,80}pro\s*=\s*true/iu);
});

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

test("Fast planner fixture decisions preserve model-selected tools", async () => {
  const fixtures = [
    {
      name: "no_tools",
      compact: {
        m: 0,
        i: 0,
        cm: false,
        pk: false,
        ws: false,
        q: null,
        pro: false,
      },
      expected: {
        needChatMemory: false,
        needPersonaKnowledge: false,
        needWebSearch: false,
        webSearchQuery: null,
        shouldSchedule: false,
      },
    },
    {
      name: "memory_only",
      compact: {
        m: 0,
        i: 0,
        cm: true,
        pk: false,
        ws: false,
        q: null,
        pro: false,
      },
      expected: {
        needChatMemory: true,
        needPersonaKnowledge: false,
        needWebSearch: false,
        webSearchQuery: null,
        shouldSchedule: false,
      },
    },
    {
      name: "multi_context",
      compact: {
        m: 2,
        i: 1,
        cm: true,
        pk: true,
        ws: true,
        q: "纪晓岚 最新影视讨论",
        rp: {
          s: "纪晓岚",
          st: "persona",
          nq: "最近有哪些影视讨论",
          qs: ["纪晓岚 最新影视讨论", "纪晓岚 近期 热度"],
          fr: "latest_available",
          tw: "recent",
          nf: "say_not_found_do_not_guess",
        },
        pro: true,
      },
      expected: {
        needChatMemory: true,
        needPersonaKnowledge: true,
        needWebSearch: true,
        webSearchQuery: "纪晓岚 最新影视讨论",
        shouldSchedule: true,
      },
    },
  ] as const;

  for (const fixture of fixtures) {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(fixture.compact),
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
        userPrompt: "测试 planner 自主判断工具",
      });

      assert.equal(result.plan.needChatMemory, fixture.expected.needChatMemory, fixture.name);
      assert.equal(result.plan.needPersonaKnowledge, fixture.expected.needPersonaKnowledge, fixture.name);
      assert.equal(result.plan.needWebSearch, fixture.expected.needWebSearch, fixture.name);
      assert.equal(result.plan.webSearchQuery, fixture.expected.webSearchQuery, fixture.name);
      assert.equal(result.plan.proactiveCandidate.shouldSchedule, fixture.expected.shouldSchedule, fixture.name);
    } finally {
      fetchMock.mock.restore();
    }
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
