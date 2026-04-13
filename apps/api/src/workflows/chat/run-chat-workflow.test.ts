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
