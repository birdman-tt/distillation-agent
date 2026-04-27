import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApiApp } from "../../app.js";
import { getSql, resetSqlForTests } from "../../db/client.js";
import {
  upsertChatMessageEmbedding,
  upsertPersonaProfileChunkEmbedding,
  upsertPersonaSourceChunkEmbedding,
  upsertUserMemoryFact,
} from "../../db/repositories/chat-retrieval-repository.js";
import { appendChatMessages, saveChatSession } from "../../store/chat-store.js";
import { assembleChatContext } from "./assemble-chat-context.js";

const embedding1024 = (seed: number) => Array.from({ length: 1024 }, (_, index) => (index === seed ? 1 : 0));

test("assembleChatContext keeps full chronological history while it is under the prompt budget", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const chatId = randomUUID();

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });

    await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你更看重秩序还是效率？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 10_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "ASSISTANT",
        content: "我会先把秩序的尺度定住，再谈效率。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 9_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "USER",
        content: "统一是不是意味着更强硬？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 8_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "ASSISTANT",
        content: "强硬若换不来秩序，只是额外代价。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 7_000).toISOString(),
      },
    ]);

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你刚才说的秩序尺度，展开讲讲。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);
    await upsertUserMemoryFact({
      chatId,
      sourceMessageId: latestUserMessage.messageId,
      factType: "name",
      factValue: "小雨",
      confidence: 1,
    });

    const context = await assembleChatContext({
      chatId,
      personaId: null,
      personaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      query: "你刚才说的秩序尺度，展开讲讲。",
      latestMessageId: latestUserMessage.messageId,
      latestTurnIndex: latestUserMessage.turnIndex,
      personaEvidence: [],
    });

    assert.deepEqual(
      context.recentTurns.map((item) => item.content),
      [
        "你更看重秩序还是效率？",
        "我会先把秩序的尺度定住，再谈效率。",
        "统一是不是意味着更强硬？",
        "强硬若换不来秩序，只是额外代价。",
      ],
    );
    assert.deepEqual(context.userFacts, [
      {
        factType: "name",
        factValue: "小雨",
        sourceMessageId: latestUserMessage.messageId,
        confidence: 1,
      },
    ]);
    assert.equal(context.diagnostics.contextBudget.truncated, false);
    assert.equal(context.diagnostics.userFacts.totalActiveFacts, 1);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("assembleChatContext adds semantic vector hits outside the recent window", async () => {
  const previousBudget = process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS;
  process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS = "60";

  const apiApp = buildApiApp();
  await apiApp.ready();

  const chatId = randomUUID();
  const personaVersionId = "64c071d9-a7a6-4dad-8a67-dcb0370d03f8";

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: personaVersionId,
      shareSlug: null,
      messages: [],
    });

    const [rememberedMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "我小时候最喜欢的动物是鲸鱼。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 30_000).toISOString(),
      },
    ]);
    assert.ok(rememberedMessage);
    await upsertChatMessageEmbedding({
      chatId,
      messageId: rememberedMessage.messageId,
      role: "USER",
      content: rememberedMessage.content,
      embedding: embedding1024(21),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      turnIndex: rememberedMessage.turnIndex,
    });

    const fillerMessages = Array.from({ length: 8 }, (_, index) => ({
      id: randomUUID(),
      role: index % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
      content: `最近第 ${index + 1} 条普通闲聊内容，用来占满最近窗口。`,
      basis: null,
      basisSummary: null,
      inferenceLevel: null,
      conflictDetected: null,
      refusalReason: null,
      createdAt: new Date(Date.now() - (20 - index) * 1_000).toISOString(),
    }));
    await appendChatMessages(chatId, fillerMessages);

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "我以前说过喜欢什么动物吗？",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const context = await assembleChatContext(
      {
        chatId,
        personaId: null,
        personaVersionId,
        query: "我以前说过喜欢什么动物吗？",
        latestMessageId: latestUserMessage.messageId,
        latestTurnIndex: latestUserMessage.turnIndex,
        personaEvidence: [],
      },
      {
        requestEmbeddings: async () => [embedding1024(21)],
        isVectorRetrievalEnabled: () => true,
      },
    );

    assert.equal(context.diagnostics.vectorSearch.enabled, true);
    assert.ok(context.recentTurns.every((item) => item.messageId !== rememberedMessage.messageId));
    assert.match(context.retrievedMemories[0]?.content ?? "", /鲸鱼/);
    assert.equal(context.retrievedMemories[0]?.reason, "semantic_vector");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (previousBudget === undefined) {
      delete process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS;
    } else {
      process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS = previousBudget;
    }
  }
});

test("assembleChatContext adds persona vector chunks", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const sql = getSql();
  const chatId = randomUUID();
  const personaId = "0f2610a1-34b2-46c8-b915-f92d928f06a1";
  const personaVersionId = "64c071d9-a7a6-4dad-8a67-dcb0370d03f8";
  const sourceId = randomUUID();

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: personaVersionId,
      shareSlug: null,
      messages: [],
    });
    await sql`
      insert into persona_sources (
        id,
        persona_id,
        input_type,
        review_status,
        source_title,
        source_kind,
        trust_score
      ) values (
        ${sourceId}::uuid,
        ${personaId}::uuid,
        'TEXT',
        'APPROVED',
        '投资原则资料',
        'PRIMARY',
        90
      )
    `;
    await upsertPersonaSourceChunkEmbedding({
      personaId,
      personaVersionId,
      sourceId,
      personaChunkId: null,
      chunkIndex: 0,
      chunkText: "投资时先看风险，再看收益，避免愚蠢错误。",
      embedding: embedding1024(31),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
    });
    await upsertPersonaProfileChunkEmbedding({
      personaVersionId,
      section: "principles",
      content: "重视长期、概率和反蠢判断。",
      embedding: embedding1024(31),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
    });

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "聊聊投资风险。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const context = await assembleChatContext(
      {
        chatId,
        personaId,
        personaVersionId,
        query: "聊聊投资风险。",
        latestMessageId: latestUserMessage.messageId,
        latestTurnIndex: latestUserMessage.turnIndex,
        personaEvidence: [],
      },
      {
        requestEmbeddings: async () => [embedding1024(31)],
        isVectorRetrievalEnabled: () => true,
      },
    );

    assert.ok(context.diagnostics.vectorSearch.personaSourceHits >= 1);
    assert.ok(context.diagnostics.vectorSearch.personaProfileHits >= 1);
    assert.ok(context.personaChunks.some((chunk) => chunk.scope === "source" && chunk.title === "投资原则资料"));
    assert.ok(context.personaChunks.some((chunk) => chunk.scope === "profile" && chunk.section === "principles"));
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("assembleChatContext can skip decision-disabled vector retrieval", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const chatId = randomUUID();
  const personaVersionId = "64c071d9-a7a6-4dad-8a67-dcb0370d03f8";
  let embeddingRequests = 0;

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: personaVersionId,
      shareSlug: null,
      messages: [],
    });

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "你好",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const context = await assembleChatContext(
      {
        chatId,
        personaId: null,
        personaVersionId,
        query: "你好",
        latestMessageId: latestUserMessage.messageId,
        latestTurnIndex: latestUserMessage.turnIndex,
        personaEvidence: [],
        includeChatMemory: false,
        includePersonaKnowledge: false,
      },
      {
        requestEmbeddings: async () => {
          embeddingRequests += 1;
          return [embedding1024(1)];
        },
        isVectorRetrievalEnabled: () => true,
      },
    );

    assert.equal(embeddingRequests, 0);
    assert.equal(context.diagnostics.memorySearch.returnedHits, 0);
    assert.equal(context.diagnostics.vectorSearch.enabled, false);
    assert.deepEqual(context.retrievedMemories, []);
    assert.deepEqual(context.personaChunks, []);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("assembleChatContext trims oldest history first when the prompt budget is exceeded", async () => {
  const previousBudget = process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS;
  process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS = "80";

  const apiApp = buildApiApp();
  await apiApp.ready();

  const chatId = randomUUID();

  try {
    await saveChatSession({
      id: chatId,
      targetType: "published_persona",
      targetPersonaId: null,
      targetPersonaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      shareSlug: null,
      messages: [],
    });

    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: randomUUID(),
      role: index % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
      content: `第 ${index + 1} 条历史消息，包含一些足够占用预算的上下文内容。`,
      basis: null,
      basisSummary: null,
      inferenceLevel: null,
      conflictDetected: null,
      refusalReason: null,
      createdAt: new Date(Date.now() - (10 - index) * 1_000).toISOString(),
    }));
    await appendChatMessages(chatId, messages);

    const [latestUserMessage] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "继续刚才的话题。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(latestUserMessage);

    const context = await assembleChatContext({
      chatId,
      personaId: null,
      personaVersionId: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      query: "继续刚才的话题。",
      latestMessageId: latestUserMessage.messageId,
      latestTurnIndex: latestUserMessage.turnIndex,
      personaEvidence: [],
    });

    assert.equal(context.diagnostics.contextBudget.truncated, true);
    assert.ok(context.recentTurns.length > 0);
    assert.equal(context.recentTurns.at(-1)?.content, "第 8 条历史消息，包含一些足够占用预算的上下文内容。");
    assert.ok(!context.recentTurns.some((item) => item.content.startsWith("第 1 条")));
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (previousBudget === undefined) {
      delete process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS;
    } else {
      process.env.CHAT_CONTEXT_MAX_INPUT_TOKENS = previousBudget;
    }
  }
});
