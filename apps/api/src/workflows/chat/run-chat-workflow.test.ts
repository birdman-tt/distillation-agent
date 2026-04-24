import assert from "node:assert/strict";
import test from "node:test";

import { findPersonaSeedByPersonaId } from "../../seed/official-personae.js";
import { __internal, runChatWorkflow } from "./run-chat-workflow.js";

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

test("numeric model inference levels are tolerated instead of forcing a fallback reply", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果今天从头建立一个国家秩序，你最想先定下什么气质？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把法度与尺度立稳，让后续动作都不至于失序。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "统一标准和制度，是维持大一统秩序的核心手段。",
        },
        inferenceLevel: 2,
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把法度与尺度立稳，让后续动作都不至于失序。");
  assert.equal(reply.inferenceLevel, "grounded");
  assert.equal(reply.refusalReason, "none");
});

test("chat workflow passes recent turns and retrieved memory into the user prompt", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  let capturedPrompt = "";
  const reply = await runChatWorkflow(
    {
      content: "那你刚才说的秩序尺度，展开讲讲。",
      seed,
      chatContext: {
        recentTurns: [
          {
            messageId: "11111111-1111-1111-1111-111111111111",
            role: "USER",
            content: "你更看重秩序还是效率？",
            createdAt: new Date().toISOString(),
          },
          {
            messageId: "22222222-2222-2222-2222-222222222222",
            role: "ASSISTANT",
            content: "我会先把秩序的尺度定住，再谈效率。",
            createdAt: new Date().toISOString(),
          },
        ],
        retrievedMemories: [
          {
            messageId: "33333333-3333-3333-3333-333333333333",
            role: "ASSISTANT",
            content: "若尺度先乱，后面的效率只会加速失序。",
            createdAt: new Date().toISOString(),
            score: 0.91,
            reason: "followup_reference",
            turnDistance: 2,
          },
        ],
        personaEvidence: [],
      },
    },
    {
      requestStructuredJson: async (input) => {
        capturedPrompt = input.userPrompt;
        return {
          answer: "我会先把尺度讲清，再谈动作怎么落。",
          basisSummary: {
            mode: "SUPPORTED" as const,
            summary: "延续秩序与尺度优先的画像。",
          },
          inferenceLevel: "grounded" as const,
          conflictDetected: false,
          refusalReason: "none",
        };
      },
    },
  );

  assert.ok(reply);
  assert.match(capturedPrompt, /\[Recent Conversation Window\]/);
  assert.match(capturedPrompt, /我会先把秩序的尺度定住/);
  assert.match(capturedPrompt, /\[Retrieved Chat Memory\]/);
  assert.match(capturedPrompt, /若尺度先乱/);
});

test("chat workflow retries once when the draft answer is too close to a recent assistant reply", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const systemPrompts: string[] = [];
  let callCount = 0;
  const reply = await runChatWorkflow(
    {
      content: "如果还是迟迟不动手，你会怎么继续逼他往前？",
      seed,
      chatContext: {
        recentTurns: [
          {
            messageId: "11111111-1111-1111-1111-111111111111",
            role: "ASSISTANT",
            content: "重秩序，也重控制。若只按我一贯的取向来想，我会先从判断尺度和行动边界去判断，再决定动作轻重，而不会急着把话说死。",
            createdAt: new Date().toISOString(),
          },
        ],
        retrievedMemories: [],
        personaEvidence: [],
      },
    },
    {
      requestStructuredJson: async (input) => {
        systemPrompts.push(input.systemPrompt);
        callCount += 1;

        if (callCount === 1) {
          return {
            answer: "重秩序，也重控制。若只按我一贯的取向来想，我会先从判断尺度和行动边界去判断，再决定动作轻重，而不会急着把话说死。",
            basisSummary: {
              mode: "INFERRED" as const,
              summary: "第一次草稿过于接近上一轮回答。",
            },
            inferenceLevel: "inferred" as const,
            conflictDetected: false,
            refusalReason: "none",
          };
        }

        return {
          answer: "若还是迟迟不动，我会先缩小选择面，再把期限钉死，让人没有继续拖延的余地。",
          basisSummary: {
            mode: "INFERRED" as const,
            summary: "第二次草稿换了新的表达路径。",
          },
          inferenceLevel: "inferred" as const,
          conflictDetected: false,
          refusalReason: "none",
        };
      },
    },
  );

  assert.ok(reply);
  assert.equal(callCount, 2);
  assert.equal(reply.answer, "若还是迟迟不动，我会先缩小选择面，再把期限钉死，让人没有继续拖延的余地。");
  assert.match(systemPrompts[1] ?? "", /上一轮草稿与近期 assistant 话术过近/);
});

test("assistant similarity guard catches exact and prefix-heavy repeats", () => {
  assert.equal(
    __internal.isTooCloseToRecentAssistantAnswer("重秩序，也重控制。先把尺度定住，再谈动作。", [
      "重秩序，也重控制。先把尺度定住，再谈动作。",
    ]),
    true,
  );
  assert.equal(
    __internal.isTooCloseToRecentAssistantAnswer("先把尺度定住，再谈动作和后果。", [
      "先把尺度定住，再谈动作。",
    ]),
    true,
  );
  assert.equal(
    __internal.isTooCloseToRecentAssistantAnswer("先把拖延的借口拆掉，再逼他当天交付一个结果。", [
      "重秩序，也重控制。先把尺度定住，再谈动作。",
    ]),
    false,
  );
});
