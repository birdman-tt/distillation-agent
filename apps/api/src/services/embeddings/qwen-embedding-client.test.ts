import assert from "node:assert/strict";
import { test } from "node:test";

import { requestQwenEmbeddings } from "./qwen-embedding-client.js";

test("requestQwenEmbeddings calls OpenAI-compatible embeddings endpoint", async () => {
  const requests: Array<{ url: string; body: unknown; authorization: string | null }> = [];

  const embeddings = await requestQwenEmbeddings(
    {
      apiKey: "test-key",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "text-embedding-v4",
      dimensions: 1024,
      inputs: ["我叫小雨"],
    },
    {
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
          authorization: init?.headers instanceof Headers ? init.headers.get("authorization") : null,
        });
        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  assert.deepEqual(embeddings, [[0.1, 0.2, 0.3]]);
  assert.equal(requests[0]?.url, "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings");
  assert.equal(requests[0]?.authorization, "Bearer test-key");
  assert.deepEqual(requests[0]?.body, {
    model: "text-embedding-v4",
    input: ["我叫小雨"],
    dimensions: 1024,
  });
});
