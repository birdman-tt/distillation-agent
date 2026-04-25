import assert from "node:assert/strict";
import test from "node:test";

import { findPersonaSeedByPersonaId } from "../../seed/official-personae.js";
import { __internal, runChatWorkflow } from "./run-chat-workflow.js";

test("official persona questions use the structured model runtime before falling back to seed replies", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "一个产品到底该先卷参数还是先卷体验？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
          answer: "我会先把用户能感知到的体验打透，再让参数为体验服务。",
          basisSummary: {
            mode: "SUPPORTED" as const,
            summary: "依据人物画像中的产品体验与用户感知导向生成。",
          },
          inferenceLevel: "grounded" as const,
          conflictDetected: false,
          refusalReason: "none",
        }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把用户能感知到的体验打透，再让参数为体验服务。");
  assert.equal(reply.inferenceLevel, "grounded");
  assert.ok(reply.basis.length > 0);
});

test("chat workflow normalizes empty refusalReason from the model to none", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "一个产品到底该先卷参数还是先卷体验？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先补体验短板，再逐步把参数优势讲清楚。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "依据产品体验与用户感知导向的官方资料。",
        },
        inferenceLevel: "grounded" as const,
        conflictDetected: false,
        refusalReason: "",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先补体验短板，再逐步把参数优势讲清楚。");
  assert.equal(reply.refusalReason, "none");
});

test("open-ended questions no longer short-circuit to out_of_scope before the model runs", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果今天从头做一个产品，你最想先定下什么体验？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把用户每天真正用到的体验定住，再决定哪些参数值得投入。",
        basisSummary: {
          mode: "INFERRED" as const,
          summary: "回答延续了用户体验优先的画像风格，而不是复述单条事实。",
        },
        inferenceLevel: "inferred" as const,
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把用户每天真正用到的体验定住，再决定哪些参数值得投入。");
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
      content: "如果今天从头做一个产品，你最想先定下什么体验？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把用户感知最强的体验做稳，再让参数成为背后的支撑。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "用户感知到的体验，是产品长期口碑的核心支点。",
        },
        inferenceLevel: "LOW" as unknown as "inferred",
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把用户感知最强的体验做稳，再让参数成为背后的支撑。");
  assert.match(reply.inferenceLevel, /grounded|inferred/);
  assert.equal(reply.refusalReason, "none");
});

test("numeric model inference levels are tolerated instead of forcing a fallback reply", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  const reply = await runChatWorkflow(
    {
      content: "如果今天从头做一个产品，你最想先定下什么体验？",
      seed,
    },
    {
      requestStructuredJson: async () => ({
        answer: "我会先把体验账算清楚，让后续每个参数投入都有用户价值。",
        basisSummary: {
          mode: "SUPPORTED" as const,
          summary: "用户体验和效率，是产品判断的核心依据。",
        },
        inferenceLevel: 2,
        conflictDetected: false,
        refusalReason: "none",
      }),
    },
  );

  assert.ok(reply);
  assert.equal(reply.answer, "我会先把体验账算清楚，让后续每个参数投入都有用户价值。");
  assert.equal(reply.inferenceLevel, "grounded");
  assert.equal(reply.refusalReason, "none");
});

test("chat workflow passes recent turns and retrieved memory into the user prompt", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  let capturedPrompt = "";
  const reply = await runChatWorkflow(
    {
      content: "那你刚才说的体验账，展开讲讲。",
      seed,
      chatContext: {
        recentTurns: [
          {
            messageId: "11111111-1111-1111-1111-111111111111",
            role: "USER",
            content: "你更看重参数还是体验？",
            createdAt: new Date().toISOString(),
          },
          {
            messageId: "22222222-2222-2222-2222-222222222222",
            role: "ASSISTANT",
            content: "我会先把用户能感知到的体验定住，再谈参数。",
            createdAt: new Date().toISOString(),
          },
        ],
        retrievedMemories: [
          {
            messageId: "33333333-3333-3333-3333-333333333333",
            role: "ASSISTANT",
            content: "如果用户感知不到，参数只是发布会上的自嗨。",
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
          answer: "我会先把体验账讲清，再谈参数怎么落。",
          basisSummary: {
            mode: "SUPPORTED" as const,
            summary: "延续体验优先和用户感知导向的画像。",
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
  assert.match(capturedPrompt, /我会先把用户能感知到的体验定住/);
  assert.match(capturedPrompt, /\[Retrieved Chat Memory\]/);
  assert.match(capturedPrompt, /参数只是发布会上的自嗨/);
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
            content: "把复杂产品讲成普通人能感知的体验。若只按我一贯的取向来想，我会先从用户场景和体验账去判断，再决定参数投入，而不会急着讲宏大叙事。",
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
            answer: "把复杂产品讲成普通人能感知的体验。若只按我一贯的取向来想，我会先从用户场景和体验账去判断，再决定参数投入，而不会急着讲宏大叙事。",
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
    __internal.isTooCloseToRecentAssistantAnswer("先把体验打透，再谈参数。", [
      "先把体验打透，再谈参数。",
    ]),
    true,
  );
  assert.equal(
    __internal.isTooCloseToRecentAssistantAnswer("先把体验打透，再谈参数和成本。", [
      "先把体验打透，再谈参数。",
    ]),
    true,
  );
  assert.equal(
    __internal.isTooCloseToRecentAssistantAnswer("先把拖延的借口拆掉，再逼他当天交付一个结果。", [
      "先把体验打透，再谈参数。",
    ]),
    false,
  );
});
