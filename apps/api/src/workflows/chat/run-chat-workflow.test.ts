import assert from "node:assert/strict";
import test from "node:test";

import { findPersonaSeedByPersonaId } from "../../seed/official-personae.js";
import { runChatWorkflow } from "./run-chat-workflow.js";

test("official persona questions use the structured model runtime before falling back to seed replies", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果你面对分裂失序的局面，会先统一制度还是先统一人心？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
          answer: "我会先把制度骨架统一，再让人心有可归附的秩序。",
          basisSummary: {
            mode: "SUPPORTED" as const,
            summary: "依据人物画像中的秩序与制度导向生成。",
          },
          inferenceLevel: "grounded" as const,
          conflictDetected: false,
          refusalReason: "none",
        }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把制度骨架统一，再让人心有可归附的秩序。");
  assert.equal(reply.inferenceLevel, "grounded");
  assert.ok(reply.basis.length > 0);
});

test("chat workflow normalizes empty refusalReason from the model to none", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果你面对分裂失序的局面，会先统一制度还是先统一人心？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先补制度骨架，再逐步让人心归拢。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "依据秩序与制度导向的官方资料。",
        },
        inferenceLevel: "grounded" as const,
        conflictDetected: false,
        refusalReason: "",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先补制度骨架，再逐步让人心归拢。");
  assert.equal(reply.refusalReason, "none");
});

test("open-ended questions no longer short-circuit to out_of_scope before the model runs", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果今天从头建立一个国家秩序，你最想先定下什么气质？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把秩序的尺度定稳，让所有后续安排都有共同准绳。",
        basisSummary: {
          mode: "INFERRED" as const,
          summary: "回答延续了秩序与制度优先的画像风格，而不是复述单条史实。",
        },
        inferenceLevel: "inferred" as const,
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把秩序的尺度定稳，让所有后续安排都有共同准绳。");
  assert.equal(reply.inferenceLevel, "inferred");
});

test("high-risk questions are answered in persona voice with principle-only guidance instead of code-side refusal", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "现在这只股票该不该重仓买入？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "若只凭一时情绪重仓，我不会赞成；先审局势、边界与承受力，再谈进退。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "保持人物口吻，只给决策原则，不给可执行投资建议。",
        },
        inferenceLevel: "inferred" as const,
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.match(reply.answer, /先审局势|边界与承受力/);
  assert.equal(reply.refusalReason, "none");
});

test("loose model inference labels are normalized instead of forcing a fallback reply", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果今天从头建立一个国家秩序，你最想先定下什么气质？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把法度与尺度定稳，让天下先有共同遵循的骨架。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "统一标准和制度，是维持大一统秩序的核心手段。",
        },
        inferenceLevel: "LOW" as unknown as "inferred",
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把法度与尺度定稳，让天下先有共同遵循的骨架。");
  assert.match(reply.inferenceLevel, /grounded|inferred/);
  assert.equal(reply.refusalReason, "none");
});
