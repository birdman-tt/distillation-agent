import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { runMiniMaxPlannerDecision, runMiniMaxToolLoop } from "./minimax-client.js";

test("MiniMax planner executes requested tools and returns the final parsed plan", async () => {
  const requests: unknown[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_context",
                    type: "function",
                    function: {
                      name: "get_chat_context",
                      arguments: JSON.stringify({ maxBytes: 1024 }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                userIntent: "继续追问前文",
                contextUsed: ["get_chat_context"],
                replyGoal: "承接前文并给出新的判断",
                responseOutline: ["先承接", "再提出判断"],
                shouldSendMultipleMessages: true,
                suggestedMessageCount: 2,
                avoidRepeating: ["不要复述上一条 assistant 原句"],
                proactiveCandidate: {
                  shouldSchedule: false,
                  delaySeconds: null,
                  topic: null,
                  reason: null,
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runMiniMaxToolLoop({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a planner.",
      userPrompt: "用户刚才说了什么？",
      tools: [
        {
          name: "get_chat_context",
          description: "Get bounded chat context.",
          parameters: {
            type: "object",
            properties: {
              maxBytes: { type: "number" },
            },
          },
          execute: async () => ({ recentTurns: [{ role: "USER", content: "继续讲" }] }),
        },
      ],
      maxToolCalls: 4,
    });

    assert.equal(result.plan.userIntent, "继续追问前文");
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0]?.name, "get_chat_context");
    assert.equal(requests.length, 2);
    assert.equal((requests[0] as { reasoning_split?: unknown }).reasoning_split, true);
    assert.match(JSON.stringify(requests[1]), /tool/);
    assert.match(JSON.stringify(requests[1]), /call_context/);
  } finally {
    fetchMock.mock.restore();
  }
});

test("MiniMax planner decision uses a single request without exposing tools", async () => {
  const requests: unknown[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                decision: {
                  userIntent: "纠正上一轮提到的新车名称",
                  replyMode: "FACT",
                  personaIntensity: "medium",
                  needChatMemory: true,
                  needPersonaKnowledge: true,
                  needWebSearch: true,
                  webSearchQuery: "尚界Z7 新上市 配置 价格 评价",
                  webSearchReason: "用户纠正上一轮新上市车型名称，需要最新公开信息",
                  contextUsed: ["recent_turns"],
                  replyGoal: "承接更正并结合最新资料回答",
                  responseOutline: ["先承接更正", "再说明需要看公开信息和产品体验"],
                  shouldSendMultipleMessages: false,
                  suggestedMessageCount: 1,
                  avoidRepeating: [],
                  proactiveCandidate: {
                    shouldSchedule: false,
                    delaySeconds: null,
                    topic: null,
                    reason: null,
                  },
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runMiniMaxPlannerDecision({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a lightweight decision planner.",
      userPrompt: "是尚界z7 不好意思 我发错了",
    });

    assert.equal(result.plan.needWebSearch, true);
    assert.equal(result.plan.needChatMemory, true);
    assert.equal(result.plan.needPersonaKnowledge, true);
    assert.equal(result.plan.replyMode, "FACT");
    assert.equal(requests.length, 1);
    assert.equal("tools" in (requests[0] as Record<string, unknown>), false);
    assert.equal("tool_choice" in (requests[0] as Record<string, unknown>), false);
  } finally {
    fetchMock.mock.restore();
  }
});

test("MiniMax planner strips thinking blocks before parsing plan JSON", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content:
                '<think>internal reasoning</think>\n```json\n{"userIntent":"问候","contextUsed":[],"replyGoal":"自然回应","responseOutline":["回应"],"shouldSendMultipleMessages":false,"suggestedMessageCount":1,"avoidRepeating":[],"proactiveCandidate":{"shouldSchedule":false,"delaySeconds":null,"topic":null,"reason":null}}\n```',
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runMiniMaxToolLoop({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a planner.",
      userPrompt: "你好",
      tools: [],
    });

    assert.equal(result.plan.userIntent, "问候");
  } finally {
    fetchMock.mock.restore();
  }
});

test("MiniMax planner accepts a common plan wrapper object", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                plan: {
                  userIntent: "问候",
                  contextUsed: [],
                  replyGoal: "自然回应",
                  responseOutline: ["回应"],
                  shouldSendMultipleMessages: false,
                  suggestedMessageCount: 1,
                  avoidRepeating: [],
                  proactiveCandidate: {
                    shouldSchedule: false,
                    delaySeconds: null,
                    topic: null,
                    reason: null,
                  },
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runMiniMaxToolLoop({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a planner.",
      userPrompt: "你好",
      tools: [],
    });

    assert.equal(result.plan.userIntent, "问候");
  } finally {
    fetchMock.mock.restore();
  }
});

test("MiniMax planner normalizes loose JSON field types before schema parsing", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                userIntent: "问候",
                contextUsed: "空",
                replyGoal: "自然回应",
                responseOutline: "简短回应问候",
                shouldSendMultipleMessages: false,
                suggestedMessageCount: 1,
                avoidRepeating: "",
                proactiveCandidate: false,
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await runMiniMaxToolLoop({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a planner.",
      userPrompt: "你好",
      tools: [],
    });

    assert.deepEqual(result.plan.contextUsed, []);
    assert.deepEqual(result.plan.responseOutline, ["简短回应问候"]);
    assert.deepEqual(result.plan.avoidRepeating, []);
    assert.deepEqual(result.plan.proactiveCandidate, {
      shouldSchedule: false,
      delaySeconds: null,
      topic: null,
      reason: null,
    });
  } finally {
    fetchMock.mock.restore();
  }
});

test("MiniMax planner preserves full assistant messages in tool loop history", async () => {
  const requests: unknown[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                reasoning_content: "需要查上下文",
                reasoning_details: [{ type: "reasoning.text", text: "需要查上下文" }],
                tool_calls: [
                  {
                    id: "call_context",
                    type: "function",
                    function: {
                      name: "get_chat_context",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({
                userIntent: "继续前文",
                contextUsed: ["get_chat_context"],
                replyGoal: "承接",
                responseOutline: ["承接"],
                shouldSendMultipleMessages: false,
                suggestedMessageCount: 1,
                avoidRepeating: [],
                proactiveCandidate: {
                  shouldSchedule: false,
                  delaySeconds: null,
                  topic: null,
                  reason: null,
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await runMiniMaxToolLoop({
      apiKey: "minimax-key",
      model: "MiniMax-M2.7",
      systemPrompt: "You are a planner.",
      userPrompt: "刚才说了什么？",
      tools: [
        {
          name: "get_chat_context",
          description: "Get bounded chat context.",
          parameters: { type: "object", properties: {} },
          execute: async () => ({ messages: [] }),
        },
      ],
    });

    const secondRequest = requests[1] as { messages: Array<Record<string, unknown>> };
    const assistantMessage = secondRequest.messages.find((message) => message.role === "assistant");
    assert.ok(assistantMessage);
    assert.deepEqual(assistantMessage.reasoning_details, [{ type: "reasoning.text", text: "需要查上下文" }]);
    assert.equal(assistantMessage.reasoning_content, "需要查上下文");
  } finally {
    fetchMock.mock.restore();
  }
});
