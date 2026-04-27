import assert from "node:assert/strict";
import { test } from "node:test";

import { runChatMessageEmbeddingJob } from "./chat-message-embedding-job.js";

test("runChatMessageEmbeddingJob embeds and persists one chat message", async () => {
  const calls: unknown[] = [];

  await runChatMessageEmbeddingJob(
    {
      chatId: "0f6f7ab0-03d6-4a3d-93c2-521d86c6810b",
      messageId: "bf80c84d-315c-46c7-8b10-83fa940451e5",
      role: "USER",
      content: "我叫小雨",
      turnIndex: 7,
    },
    {
      readConfig: () => ({ provider: "qwen", model: "text-embedding-v4", dimensions: 1024 }),
      requestEmbeddings: async (input) => {
        calls.push({ kind: "embed", input });
        return [[0.1, 0.2, 0.3]];
      },
      upsertEmbedding: async (input) => {
        calls.push({ kind: "upsert", input });
        return "embedding-id";
      },
    },
  );

  assert.deepEqual(calls, [
    {
      kind: "embed",
      input: {
        model: "text-embedding-v4",
        dimensions: 1024,
        inputs: ["我叫小雨"],
      },
    },
    {
      kind: "upsert",
      input: {
        chatId: "0f6f7ab0-03d6-4a3d-93c2-521d86c6810b",
        messageId: "bf80c84d-315c-46c7-8b10-83fa940451e5",
        role: "USER",
        content: "我叫小雨",
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: "text-embedding-v4",
        embeddingDimensions: 1024,
        turnIndex: 7,
      },
    },
  ]);
});
