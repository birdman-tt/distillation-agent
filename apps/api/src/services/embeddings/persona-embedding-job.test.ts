import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPersonaProfileEmbeddingChunks,
  splitTextForEmbedding,
  runPersonaProfileEmbeddingJob,
  runPersonaSourceEmbeddingJob,
} from "./persona-embedding-job.js";

test("splitTextForEmbedding creates bounded chunks with stable indexes", () => {
  const chunks = splitTextForEmbedding("第一段内容。第二段内容。第三段内容。", {
    maxChars: 8,
  });

  assert.deepEqual(
    chunks.map((chunk) => [chunk.chunkIndex, chunk.content.length <= 8]),
    [
      [0, true],
      [1, true],
      [2, true],
    ],
  );
});

test("buildPersonaProfileEmbeddingChunks extracts high-signal profile sections", () => {
  const chunks = buildPersonaProfileEmbeddingChunks({
    profileJson: {
      summary: "重视长期判断。",
      principles: ["避免愚蠢错误", "先看风险"],
      topicStrengths: ["投资", "商业"],
    },
    previewIntro: "长期主义。",
    sampleAnswers: ["别先问收益，先问风险。"],
    recommendedQuestions: ["如何判断风险？"],
  });

  assert.deepEqual(
    chunks.map((chunk) => chunk.section),
    ["summary", "principles", "topic_strengths", "style_examples", "recommended_questions"],
  );
});

test("runPersonaProfileEmbeddingJob embeds and upserts profile chunks", async () => {
  const writes: unknown[] = [];
  const result = await runPersonaProfileEmbeddingJob(
    {
      personaVersionId: "11111111-1111-1111-1111-111111111111",
      profileJson: {
        summary: "重视长期判断。",
      },
      previewIntro: null,
      sampleAnswers: [],
      recommendedQuestions: [],
    },
    {
      readConfig: () => ({ provider: "qwen", model: "text-embedding-v4", dimensions: 1024 }),
      requestEmbeddings: async (input) => input.inputs.map((_, index) => [index + 0.1]),
      upsertProfileChunk: async (input) => {
        writes.push(input);
        return "profile-id";
      },
    },
  );

  assert.equal(result.embeddedCount, 1);
  assert.equal((writes[0] as { section: string }).section, "summary");
  assert.deepEqual((writes[0] as { embedding: number[] }).embedding, [0.1]);
});

test("runPersonaSourceEmbeddingJob embeds and upserts source chunks", async () => {
  const writes: unknown[] = [];
  const result = await runPersonaSourceEmbeddingJob(
    {
      personaId: "11111111-1111-1111-1111-111111111111",
      personaVersionId: "22222222-2222-2222-2222-222222222222",
      sourceId: "33333333-3333-3333-3333-333333333333",
      normalizedText: "投资时先看风险。".repeat(20),
    },
    {
      readConfig: () => ({ provider: "qwen", model: "text-embedding-v4", dimensions: 1024 }),
      requestEmbeddings: async (input) => input.inputs.map((_, index) => [index + 0.2]),
      upsertSourceChunk: async (input) => {
        writes.push(input);
        return "source-id";
      },
    },
  );

  assert.ok(result.embeddedCount > 0);
  assert.equal((writes[0] as { sourceId: string }).sourceId, "33333333-3333-3333-3333-333333333333");
  assert.deepEqual((writes[0] as { embedding: number[] }).embedding, [0.2]);
});
