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

test("chat workflow runtime date includes local time and timezone", () => {
  const originalTimezone = process.env.CHAT_RUNTIME_TIME_ZONE;
  process.env.CHAT_RUNTIME_TIME_ZONE = "Asia/Shanghai";
  try {
    const value = __internal.formatRuntimeDate(new Date("2026-04-27T06:43:39.000Z"));
    assert.match(value, /2026年4月27日/);
    assert.match(value, /星期一/);
    assert.match(value, /14:43:39/);
    assert.match(value, /Asia\/Shanghai/);
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.CHAT_RUNTIME_TIME_ZONE;
    } else {
      process.env.CHAT_RUNTIME_TIME_ZONE = originalTimezone;
    }
  }
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
        userFacts: [],
        personaChunks: [],
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

test("chat workflow passes web context into the user prompt", async () => {
  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);

  let capturedPrompt = "";
  const reply = await runChatWorkflow(
    {
      content: "今天有什么最新消息？",
      seed,
      webContext: {
        query: "latest news",
        freshnessStatus: "fresh",
        keyFindings: ["有一条刚发布的消息。"],
        sources: [
          {
            title: "News Source",
            url: "https://example.com/news",
            publishedAt: null,
            snippet: "latest",
          },
        ],
        uncertainty: null,
      },
    },
    {
      requestStructuredJson: async (input) => {
        capturedPrompt = input.userPrompt;
        return {
          answer: "我会先按查到的新信息说：有一条刚发布的消息。",
          basisSummary: {
            mode: "INFERRED" as const,
            summary: "结合联网上下文作答。",
          },
          inferenceLevel: "inferred" as const,
          conflictDetected: false,
          refusalReason: "none",
        };
      },
    },
  );

  assert.ok(reply);
  assert.match(capturedPrompt, /\[Web Context\]/);
  assert.match(capturedPrompt, /https:\/\/example\.com\/news/);
});

test("chat workflow uses a larger structured JSON budget for web-context answers", async () => {
  let capturedMaxTokens: number | undefined;
  const seed = findPersonaSeedByPersonaId("9cb9d15b-b39b-4451-a7c1-20dbc0d7496e");
  assert.ok(seed);

  await runChatWorkflow(
    {
      content: "你最近的访谈节目请了谁？",
      seed,
      webContext: {
        query: "罗永浩 最近 访谈 嘉宾 2026",
        freshnessStatus: "fresh",
        keyFindings: ["2026年3月26日新一期节目邀请了杨笠当嘉宾。"],
        sources: [
          {
            title: "访谈来源",
            url: "https://example.com/interview",
            publishedAt: "2026-03-26T12:00:00",
            snippet: "新一期邀请杨笠当嘉宾。",
          },
        ],
        uncertainty: null,
      },
    },
    {
      requestStructuredJson: async (request) => {
        capturedMaxTokens = request.maxTokens;
        return {
          answer: "最近一期请的是杨笠。",
          basisSummary: {
            mode: "SUPPORTED",
            summary: "根据联网来源。",
          },
          inferenceLevel: "grounded",
          conflictDetected: false,
          refusalReason: null,
        };
      },
    },
  );

  assert.equal(capturedMaxTokens, 1400);
});

test("chat workflow disables DeepSeek V4 thinking for structured JSON replies", async () => {
  const originalModel = process.env.DEEPSEEK_CHAT_MODEL;
  const originalThinking = process.env.DEEPSEEK_CHAT_THINKING;
  process.env.DEEPSEEK_CHAT_MODEL = "deepseek-v4-flash";
  delete process.env.DEEPSEEK_CHAT_THINKING;

  const seed = findPersonaSeedByPersonaId("0f2610a1-34b2-46c8-b915-f92d928f06a1");
  assert.ok(seed);
  let capturedThinking: unknown;

  try {
    const reply = await runChatWorkflow(
      {
        content: "你觉得曲风像吗？",
        seed,
      },
      {
        requestStructuredJson: async (input) => {
          capturedThinking = input.thinking;
          return {
            answer: "有些地方像，主要是气口和松弛感接近，但每个人落点还是不一样。",
            basisSummary: {
              mode: "INFERRED" as const,
              summary: "依据闲聊语境自然回应。",
            },
            inferenceLevel: "inferred" as const,
            conflictDetected: false,
            refusalReason: "none",
          };
        },
      },
    );

    assert.ok(reply);
    assert.deepEqual(capturedThinking, { type: "disabled" });
  } finally {
    if (originalModel === undefined) {
      delete process.env.DEEPSEEK_CHAT_MODEL;
    } else {
      process.env.DEEPSEEK_CHAT_MODEL = originalModel;
    }
    if (originalThinking === undefined) {
      delete process.env.DEEPSEEK_CHAT_THINKING;
    } else {
      process.env.DEEPSEEK_CHAT_THINKING = originalThinking;
    }
  }
});

test("dynamic persona prompt does not expose distill metadata to the responder model", async () => {
  let capturedSystemPrompt = "";
  const reply = await runChatWorkflow(
    {
      content: "你的名字叫什么？",
      dynamicContext: {
        personaVersionId: "11111111-1111-4111-8111-111111111111",
        displayName: "进击的巨人里面的艾尔文团长",
        previewIntro: "基于 3 份已审核资料蒸馏出的 进击的巨人里面的艾尔文团长 对象，当前更偏 说话方式、思考方式、价值判断。",
        profileSummary: "进击的巨人里面的艾尔文团长 当前被蒸馏成一个强调 说话方式、思考方式、价值判断 的对象。",
        styleExamples: [],
        focusKeywords: ["说话方式", "思考方式", "价值判断"],
        evidence: [],
      },
    },
    {
      requestStructuredJson: async (input) => {
        capturedSystemPrompt = input.systemPrompt;
        return {
          answer: "你可以叫我艾尔文。",
          basisSummary: {
            mode: "INFERRED" as const,
            summary: "以人物称呼自然回应。",
          },
          inferenceLevel: "inferred" as const,
          conflictDetected: false,
          refusalReason: "none",
        };
      },
    },
  );

  assert.ok(reply);
  assert.doesNotMatch(capturedSystemPrompt, /基于 \d+ 份已审核资料/);
  assert.doesNotMatch(capturedSystemPrompt, /蒸馏出的|被蒸馏成|对象，当前更偏/);
  assert.match(capturedSystemPrompt, /请只输出 json/u);
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
        userFacts: [],
        personaChunks: [],
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
