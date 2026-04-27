import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApiApp } from "../../app.js";
import { resetSqlForTests } from "../client.js";
import { appendChatMessages, saveChatSession } from "../../store/chat-store.js";
import {
  listActiveUserMemoryFacts,
  searchChatMessageEmbeddings,
  searchPersonaProfileChunkEmbeddings,
  searchPersonaSourceChunkEmbeddings,
  listPersonaVersionSourceDocumentsForEmbedding,
  upsertChatMessageEmbedding,
  upsertPersonaProfileChunkEmbedding,
  upsertPersonaSourceChunkEmbedding,
  upsertUserMemoryFact,
} from "./chat-retrieval-repository.js";
import { getSql } from "../client.js";

const embedding1024 = (seed: number) => Array.from({ length: 1024 }, (_, index) => (index === seed ? 1 : 0));

test("chat retrieval repository stores chat embeddings and active user memory facts", async () => {
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

    const [message] = await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "我叫小雨，外号大铁锤。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(message);

    await upsertChatMessageEmbedding({
      chatId,
      messageId: message.messageId,
      role: "USER",
      content: message.content,
      embedding: embedding1024(3),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      turnIndex: message.turnIndex,
    });

    await upsertUserMemoryFact({
      chatId,
      sourceMessageId: message.messageId,
      factType: "name",
      factValue: "小雨",
      confidence: 1,
    });
    await upsertUserMemoryFact({
      chatId,
      sourceMessageId: message.messageId,
      factType: "nickname",
      factValue: "大铁锤",
      confidence: 1,
    });

    const facts = await listActiveUserMemoryFacts({ chatId, factTypes: ["name", "nickname"] });

    assert.deepEqual(
      facts.map((fact) => [fact.factType, fact.factValue]),
      [
        ["name", "小雨"],
        ["nickname", "大铁锤"],
      ],
    );
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("chat retrieval repository searches chat message embeddings by vector similarity", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const primaryChatId = randomUUID();
  const secondaryChatId = randomUUID();
  const personaVersionId = "64c071d9-a7a6-4dad-8a67-dcb0370d03f8";

  try {
    for (const chatId of [primaryChatId, secondaryChatId]) {
      await saveChatSession({
        id: chatId,
        targetType: "published_persona",
        targetPersonaId: null,
        targetPersonaVersionId: personaVersionId,
        shareSlug: null,
        messages: [],
      });
    }

    const [targetMessage, offTopicMessage] = await appendChatMessages(primaryChatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "我叫小雨，外号大铁锤。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 2_000).toISOString(),
      },
      {
        id: randomUUID(),
        role: "USER",
        content: "今天晚上吃牛肉烧饼。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date(Date.now() - 1_000).toISOString(),
      },
    ]);
    assert.ok(targetMessage);
    assert.ok(offTopicMessage);

    const [otherChatMessage] = await appendChatMessages(secondaryChatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "另一个 chat 里也有相似向量。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.ok(otherChatMessage);

    await upsertChatMessageEmbedding({
      chatId: primaryChatId,
      messageId: targetMessage.messageId,
      role: "USER",
      content: targetMessage.content,
      embedding: embedding1024(12),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      turnIndex: targetMessage.turnIndex,
    });
    await upsertChatMessageEmbedding({
      chatId: primaryChatId,
      messageId: offTopicMessage.messageId,
      role: "USER",
      content: offTopicMessage.content,
      embedding: embedding1024(64),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      turnIndex: offTopicMessage.turnIndex,
    });
    await upsertChatMessageEmbedding({
      chatId: secondaryChatId,
      messageId: otherChatMessage.messageId,
      role: "USER",
      content: otherChatMessage.content,
      embedding: embedding1024(12),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      turnIndex: otherChatMessage.turnIndex,
    });

    const hits = await searchChatMessageEmbeddings({
      chatId: primaryChatId,
      embedding: embedding1024(12),
      embeddingModel: "text-embedding-v4",
      limit: 4,
      latestTurnIndex: offTopicMessage.turnIndex,
    });

    assert.equal(hits[0]?.messageId, targetMessage.messageId);
    assert.match(hits[0]?.content ?? "", /小雨/);
    assert.ok(hits.every((hit) => hit.chatId === primaryChatId));
    assert.ok(hits.every((hit) => hit.messageId !== otherChatMessage.messageId));
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("chat retrieval repository stores and searches persona source and profile embeddings", async () => {
  const apiApp = buildApiApp();
  await apiApp.ready();

  const sql = getSql();
  const personaId = randomUUID();
  const personaVersionId = randomUUID();
  const sourceId = randomUUID();
  const documentId = randomUUID();

  try {
    await sql`
      insert into personae (
        id,
        display_name,
        origin_type,
        persona_type,
        listing_status,
        status
      ) values (
        ${personaId}::uuid,
        '测试投资人物',
        'OFFICIAL',
        'HISTORICAL_FIGURE',
        'PRIVATE',
        'DRAFT'
      )
    `;
    await sql`
      insert into persona_versions (
        id,
        persona_id,
        version_number,
        status,
        profile_json
      ) values (
        ${personaVersionId}::uuid,
        ${personaId}::uuid,
        1,
        'DRAFT',
        '{}'::jsonb
      )
    `;
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
    await sql`
      insert into source_documents (
        id,
        source_id,
        title,
        normalized_text,
        content_hash
      ) values (
        ${documentId}::uuid,
        ${sourceId}::uuid,
        '投资原则资料',
        '投资时先看风险，再看收益，避免愚蠢错误。',
        ${documentId}
      )
    `;
    await sql`
      insert into persona_version_sources (
        persona_version_id,
        source_id,
        document_id
      ) values (
        ${personaVersionId}::uuid,
        ${sourceId}::uuid,
        ${documentId}::uuid
      )
    `;

    await upsertPersonaSourceChunkEmbedding({
      personaId,
      personaVersionId,
      sourceId,
      personaChunkId: null,
      chunkIndex: 0,
      chunkText: "投资时先看风险，再看收益，避免愚蠢错误。",
      embedding: embedding1024(41),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
    });
    await upsertPersonaProfileChunkEmbedding({
      personaVersionId,
      section: "principles",
      content: "重视长期、风险、概率和反蠢判断。",
      embedding: embedding1024(42),
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
    });

    const sourceHits = await searchPersonaSourceChunkEmbeddings({
      personaVersionId,
      embedding: embedding1024(41),
      embeddingModel: "text-embedding-v4",
      limit: 4,
    });
    const profileHits = await searchPersonaProfileChunkEmbeddings({
      personaVersionId,
      embedding: embedding1024(42),
      embeddingModel: "text-embedding-v4",
      limit: 4,
    });
    const sourceDocuments = await listPersonaVersionSourceDocumentsForEmbedding({
      personaVersionId,
    });

    const insertedSourceHit = sourceHits.find((item) => item.sourceId === sourceId);
    assert.equal(insertedSourceHit?.title, "投资原则资料");
    assert.match(insertedSourceHit?.content ?? "", /避免愚蠢/);

    assert.equal(profileHits[0]?.section, "principles");
    assert.match(profileHits[0]?.content ?? "", /反蠢判断/);
    const insertedDocument = sourceDocuments.find((item) => item.sourceId === sourceId);
    assert.equal(insertedDocument?.documentId, documentId);
    assert.match(insertedDocument?.normalizedText ?? "", /先看风险/);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});
