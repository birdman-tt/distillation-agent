import assert from "node:assert/strict";
import test from "node:test";

import { enqueueChatMessageEmbedding } from "./chat-message-embedding-scheduler.js";

test("enqueueChatMessageEmbedding schedules an async embedding job when enabled", async () => {
  const tasks: Array<() => Promise<void>> = [];
  const calls: unknown[] = [];

  const result = enqueueChatMessageEmbedding(
    {
      chatId: "11111111-1111-1111-1111-111111111111",
      messageId: "22222222-2222-2222-2222-222222222222",
      role: "USER",
      content: "我叫小雨。",
      turnIndex: 1,
    },
    {
      isEnabled: () => true,
      runInBackground: (task) => {
        tasks.push(task);
      },
      runJob: async (input) => {
        calls.push(input);
        return "embedding-id";
      },
    },
  );

  assert.deepEqual(result, { scheduled: true, reason: null });
  assert.equal(tasks.length, 1);
  await tasks[0]!();
  assert.equal(calls.length, 1);
});

test("enqueueChatMessageEmbedding skips cleanly when disabled", () => {
  let scheduled = false;

  const result = enqueueChatMessageEmbedding(
    {
      chatId: "11111111-1111-1111-1111-111111111111",
      messageId: "22222222-2222-2222-2222-222222222222",
      role: "USER",
      content: "我叫小雨。",
      turnIndex: 1,
    },
    {
      isEnabled: () => false,
      runInBackground: () => {
        scheduled = true;
      },
    },
  );

  assert.deepEqual(result, { scheduled: false, reason: "disabled" });
  assert.equal(scheduled, false);
});
