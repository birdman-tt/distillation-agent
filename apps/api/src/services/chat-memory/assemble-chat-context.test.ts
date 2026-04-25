import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApiApp } from "../../app.js";
import { resetSqlForTests } from "../../db/client.js";
import { appendChatMessages, saveChatSession } from "../../store/chat-store.js";
import { assembleChatContext } from "./assemble-chat-context.js";

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
    assert.equal(context.diagnostics.contextBudget.truncated, false);
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
