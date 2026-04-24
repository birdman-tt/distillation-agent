import assert from "node:assert/strict";
import test from "node:test";

import { getSql, resetSqlForTests } from "./db/client.js";

test("anonymous session can create, distill, save private, publish, and keep a usable share", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, workerModule] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const { buildWorkerApp } = workerModule as { buildWorkerApp: () => { listen: Function; close: Function; server: { address: () => unknown } } };

  const workerApp = buildWorkerApp();
  await workerApp.listen({ host: "127.0.0.1", port: 0 });
  const address = workerApp.server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  const workerAddress = new URL(`http://127.0.0.1:${address.port}`);

  process.env.WORKER_BASE_URL = workerAddress.toString().replace(/\/$/, "");

  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "browser-1" },
    });
    assert.equal(anonymous.statusCode, 200);
    const anonymousBody = anonymous.json();

    const createdPersona = await apiApp.inject({
      method: "POST",
      url: "/v1/personae",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        displayName: "测试对象",
        positioning: "清醒、锋利，帮人把混乱的想法说清楚。",
        personaType: "ORIGINAL_PERSONA",
        originType: "USER",
        distillFocus: ["表达", "判断"],
      },
    });
    assert.equal(createdPersona.statusCode, 200);
    const persona = createdPersona.json();
    const persistedPersona = await sql<{ id: string }[]>`
      select id from personae where id = ${persona.id}::uuid
    `;
    assert.equal(persistedPersona.length, 1);

    const sourceResponse = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/sources/url`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        url: "https://example.com/persona",
        sourceKind: "PRIMARY",
      },
    });
    assert.equal(sourceResponse.statusCode, 200);
    const source = sourceResponse.json();
    const persistedSource = await sql<{ id: string }[]>`
      select id from persona_sources where id = ${source.id}::uuid
    `;
    assert.equal(persistedSource.length, 1);

    const textSource = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/sources/text`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        title: "text-1",
        content: "第一份文本资料，补充它的判断方式和表达风格。",
        sourceKind: "PRIMARY",
      },
    });
    assert.equal(textSource.statusCode, 200);

    const distilled = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/distill`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
    });
    assert.equal(distilled.statusCode, 200);
    const distilledBody = distilled.json();
    assert.equal(distilledBody.status, "CANDIDATE");
    const persistedVersion = await sql<{ id: string; status: string }[]>`
      select id, status
      from persona_versions
      where id = ${distilledBody.id}::uuid
    `;
    assert.equal(persistedVersion.length, 1);
    assert.equal(persistedVersion[0]?.status, "CANDIDATE");

    const savedPrivate = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${distilledBody.id}/publish`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        visibility: "PRIVATE",
      },
    });
    assert.equal(savedPrivate.statusCode, 200);
    assert.equal(savedPrivate.json().share, null);
    assert.equal(savedPrivate.json().personaStatus, "READY");
    assert.equal(savedPrivate.json().listingStatus, "PRIVATE");

    const privateDashboard = await apiApp.inject({
      method: "GET",
      url: "/v1/me/personae",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
    });
    assert.equal(privateDashboard.statusCode, 200);
    assert.equal(privateDashboard.json().stats.draftCount, 1);
    assert.equal(privateDashboard.json().stats.publishedCount, 0);
    assert.equal(privateDashboard.json().items[0]?.displayName, "测试对象");
    assert.equal(privateDashboard.json().items[0]?.primaryShareSlug, null);

    const published = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${distilledBody.id}/publish`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        visibility: "PUBLIC",
      },
    });
    assert.equal(published.statusCode, 200);
    assert.equal(published.json().status, "PUBLISHED");
    assert.ok(published.json().share?.shareSlug);

    const persistedShare = await sql<{ share_slug: string }[]>`
      select share_slug
      from share_links
      where persona_version_id = ${distilledBody.id}::uuid
    `;
    assert.equal(persistedShare.length, 1);

    const publishedDashboard = await apiApp.inject({
      method: "GET",
      url: "/v1/me/personae",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
    });
    assert.equal(publishedDashboard.statusCode, 200);
    assert.equal(publishedDashboard.json().stats.draftCount, 0);
    assert.equal(publishedDashboard.json().stats.publishedCount, 1);
    assert.equal(publishedDashboard.json().items[0]?.primaryShareSlug, persistedShare[0]?.share_slug);

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      payload: {
        targetType: "published_persona",
        personaId: persona.id,
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatBody = chat.json();

    const assistant = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatBody.id}/messages`,
      payload: {
        content: "你怎么看现在的处境？",
      },
    });
    assert.equal(assistant.statusCode, 200);

    const persistedChat = await sql<{ id: string }[]>`
      select id from chats where id = ${chatBody.id}::uuid
    `;
    assert.equal(persistedChat.length, 1);
    const persistedMessages = await sql<{ count: string }[]>`
      select count(*)::text as count
      from chat_messages
      where chat_id = ${chatBody.id}::uuid
    `;
    assert.equal(persistedMessages[0]?.count, "2");

    const feedback = await apiApp.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        personaId: persona.id,
        personaVersionId: distilledBody.id,
        chatMessageId: assistant.json().id,
        feedbackKind: "LIKENESS",
        feedbackValue: "POSITIVE",
      },
    });
    assert.equal(feedback.statusCode, 200);

    const persistedFeedback = await sql<{ count: string }[]>`
      select count(*)::text as count
      from persona_feedback
      where persona_id = ${persona.id}::uuid
    `;
    assert.equal(persistedFeedback[0]?.count, "1");
  } finally {
    await apiApp.close();
    await workerApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("official seed persona can open a persisted chat session", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();

  try {
    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      payload: {
        targetType: "published_persona",
        personaId: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      },
    });

    assert.equal(chat.statusCode, 200);
    const body = chat.json();
    assert.ok(body.id);
    assert.equal(body.targetPersonaId, null);
    assert.equal(body.targetPersonaVersionId, "64c071d9-a7a6-4dad-8a67-dcb0370d03f8");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("chat list returns the current actor's persisted histories", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();

  try {
    const primarySession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-history-primary" },
    });
    assert.equal(primarySession.statusCode, 200);
    const primaryAccessToken = primarySession.json().accessToken as string;

    const secondarySession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-history-secondary" },
    });
    assert.equal(secondarySession.statusCode, 200);
    const secondaryAccessToken = secondarySession.json().accessToken as string;

    const primaryChat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${primaryAccessToken}`,
      },
      payload: {
        targetType: "published_persona",
        personaId: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      },
    });
    assert.equal(primaryChat.statusCode, 200);
    const primaryChatId = primaryChat.json().id as string;

    const primaryReply = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${primaryChatId}/messages`,
      headers: {
        authorization: `Bearer ${primaryAccessToken}`,
      },
      payload: {
        content: "如果局面失控，应该先稳住哪里？",
      },
    });
    assert.equal(primaryReply.statusCode, 200);

    const secondaryChat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${secondaryAccessToken}`,
      },
      payload: {
        targetType: "published_persona",
        personaId: "9cb9d15b-b39b-4451-a7c1-20dbc0d7496e",
      },
    });
    assert.equal(secondaryChat.statusCode, 200);

    const secondaryChatId = secondaryChat.json().id as string;
    const secondaryReply = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${secondaryChatId}/messages`,
      headers: {
        authorization: `Bearer ${secondaryAccessToken}`,
      },
      payload: {
        content: "局势不明时，先看人还是先看势？",
      },
    });
    assert.equal(secondaryReply.statusCode, 200);

    const list = await apiApp.inject({
      method: "GET",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${primaryAccessToken}`,
      },
    });
    assert.equal(list.statusCode, 200);
    const listBody = list.json();
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0]?.displayName, "秦始皇");
    assert.equal(listBody.items[0]?.resumePersonaId, "0f2610a1-34b2-46c8-b915-f92d928f06a1");
    assert.equal(listBody.items[0]?.targetType, "published_persona");
    assert.ok(typeof listBody.items[0]?.latestMessage === "string" && listBody.items[0].latestMessage.length > 0);
    assert.ok(typeof listBody.items[0]?.updatedAt === "string" && listBody.items[0].updatedAt.length > 0);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});
