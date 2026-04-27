import assert from "node:assert/strict";
import test from "node:test";

import {
  extractUserMemoryFacts,
  runUserMemoryFactExtractionJob,
} from "./user-memory-fact-extractor.js";

test("extractUserMemoryFacts extracts only explicit low-risk identity facts", () => {
  const facts = extractUserMemoryFacts("我叫小雨，外号大铁锤，你可以叫我小雨。");

  assert.deepEqual(facts, [
    {
      factType: "name",
      factValue: "小雨",
      confidence: 1,
    },
    {
      factType: "nickname",
      factValue: "大铁锤",
      confidence: 1,
    },
  ]);
});

test("extractUserMemoryFacts ignores negated name statements", () => {
  const facts = extractUserMemoryFacts("我不叫小雨，刚才你记错了。");

  assert.deepEqual(facts, []);
});

test("runUserMemoryFactExtractionJob upserts extracted facts with source message id", async () => {
  const writes: unknown[] = [];

  const result = await runUserMemoryFactExtractionJob(
    {
      chatId: "11111111-1111-1111-1111-111111111111",
      sourceMessageId: "22222222-2222-2222-2222-222222222222",
      content: "我的名字是小雨，外号是大铁锤。",
    },
    {
      upsertFact: async (input) => {
        writes.push(input);
        return "fact-id";
      },
    },
  );

  assert.equal(result.extractedCount, 2);
  assert.deepEqual(
    writes.map((item) => ({
      factType: (item as { factType: string }).factType,
      factValue: (item as { factValue: string }).factValue,
      sourceMessageId: (item as { sourceMessageId: string }).sourceMessageId,
    })),
    [
      {
        factType: "name",
        factValue: "小雨",
        sourceMessageId: "22222222-2222-2222-2222-222222222222",
      },
      {
        factType: "nickname",
        factValue: "大铁锤",
        sourceMessageId: "22222222-2222-2222-2222-222222222222",
      },
    ],
  );
});
