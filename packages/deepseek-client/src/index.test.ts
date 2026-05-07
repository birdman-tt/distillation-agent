import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { requestStructuredJson } from "./index.js";

const resultSchema = {
  parse(input: unknown) {
    assert.ok(input && typeof input === "object" && !Array.isArray(input));
    const answer = (input as { answer?: unknown }).answer;
    assert.equal(typeof answer, "string");
    return { answer };
  },
};

test("requestStructuredJson forwards thinking config and trims JSON content", async () => {
  const requests: unknown[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '  {"answer":"ok"}  ',
              reasoning_content: "draft",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    const result = await requestStructuredJson({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      systemPrompt: "return json",
      userPrompt: "hello",
      schema: resultSchema,
      thinking: { type: "disabled" },
    });

    assert.deepEqual(result, { answer: "ok" });
    assert.equal(requests.length, 1);
    const body = requests[0] as Record<string, unknown>;
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { type: "disabled" });
  } finally {
    fetchMock.mock.restore();
  }
});

test("requestStructuredJson treats whitespace-only content as empty JSON response", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "      ",
              reasoning_content: "{\"answer\":\"not final\"}",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await assert.rejects(
      requestStructuredJson({
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        systemPrompt: "return json",
        userPrompt: "hello",
        schema: resultSchema,
        thinking: { type: "disabled" },
      }),
      /DeepSeek returned an empty JSON response/u,
    );
  } finally {
    fetchMock.mock.restore();
  }
});
