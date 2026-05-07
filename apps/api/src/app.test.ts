import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { getSql, resetSqlForTests } from "./db/client.js";
import { appendChatMessages } from "./store/chat-store.js";

process.env.CHAT_REALTIME_ENABLED = "false";
process.env.CHAT_PLANNER_ENABLED = "false";
process.env.CHAT_PROACTIVE_ENABLED = "false";

test("anonymous session can create, distill, save private, publish, and keep a usable share", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";
  await resetSqlForTests();

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
      payload: { deviceId: `browser-${randomUUID()}` },
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
    const privateDashboardItem = privateDashboard
      .json()
      .items.find((item: { displayName: string }) => item.displayName === "测试对象");
    assert.ok(privateDashboardItem);
    assert.equal(privateDashboardItem.displayName, "测试对象");
    assert.equal(privateDashboardItem.primaryShareSlug, null);

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
    const publishedDashboardItem = publishedDashboard
      .json()
      .items.find((item: { displayName: string }) => item.displayName === "测试对象");
    assert.ok(publishedDashboardItem);
    assert.equal(publishedDashboardItem.primaryShareSlug, persistedShare[0]?.share_slug);

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
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
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
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

test("legacy synchronous persona manage endpoints can be disabled before worker calls", async () => {
  const originalLegacyFlag = process.env.LEGACY_SYNC_PERSONA_MANAGE_ENABLED;
  const originalWorkerBaseUrl = process.env.WORKER_BASE_URL;
  process.env.LEGACY_SYNC_PERSONA_MANAGE_ENABLED = "false";
  process.env.WORKER_BASE_URL = "http://127.0.0.1:9";
  await resetSqlForTests();

  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: `legacy-sync-disabled-${randomUUID()}` },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const createdPersona = await apiApp.inject({
      method: "POST",
      url: "/v1/personae",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        displayName: "旧接口关闭测试",
        positioning: "用于确认旧同步接口不会触发 worker。",
        personaType: "ORIGINAL_PERSONA",
        originType: "USER",
        distillFocus: ["表达"],
      },
    });
    assert.equal(createdPersona.statusCode, 200);
    const persona = createdPersona.json();

    const urlSource = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/sources/url`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        url: "https://example.com/legacy-sync-disabled",
        sourceKind: "PRIMARY",
      },
    });
    assert.equal(urlSource.statusCode, 410);
    assert.equal(urlSource.json().message, "这个旧资料接口已停用，请使用新的资料补充流程。");

    const persistedUrlSources = await sql<{ count: string }[]>`
      select count(*)::text as count
      from persona_sources
      where persona_id = ${persona.id}::uuid and input_type = 'URL'
    `;
    assert.equal(persistedUrlSources[0]?.count, "0");

    const distill = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/distill`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(distill.statusCode, 410);
    assert.equal(distill.json().message, "这个旧蒸馏接口已停用，请使用新的创建流程。");

    const persistedVersions = await sql<{ count: string }[]>`
      select count(*)::text as count
      from persona_versions
      where persona_id = ${persona.id}::uuid and status = 'CANDIDATE'
    `;
    assert.equal(persistedVersions[0]?.count, "0");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
    if (originalLegacyFlag === undefined) {
      delete process.env.LEGACY_SYNC_PERSONA_MANAGE_ENABLED;
    } else {
      process.env.LEGACY_SYNC_PERSONA_MANAGE_ENABLED = originalLegacyFlag;
    }
    if (originalWorkerBaseUrl === undefined) {
      delete process.env.WORKER_BASE_URL;
    } else {
      process.env.WORKER_BASE_URL = originalWorkerBaseUrl;
    }
  }
});

test("official seed persona can open a persisted chat session", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "official-seed-chat" },
    });
    assert.equal(anonymous.statusCode, 200);

    const chat = await apiApp.inject({
      method: "POST",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${anonymous.json().accessToken}`,
      },
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
    const primaryHistoryItem = listBody.items.find((item: { id: string }) => item.id === primaryChatId);
    assert.ok(primaryHistoryItem);
    assert.equal(primaryHistoryItem.displayName, "雷军");
    assert.equal(primaryHistoryItem.resumePersonaId, "0f2610a1-34b2-46c8-b915-f92d928f06a1");
    assert.equal(primaryHistoryItem.targetType, "published_persona");
    assert.ok(typeof primaryHistoryItem.latestMessage === "string" && primaryHistoryItem.latestMessage.length > 0);
    assert.ok(typeof primaryHistoryItem.updatedAt === "string" && primaryHistoryItem.updatedAt.length > 0);
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

test("chat detail and message endpoints are scoped to the chat owner", async () => {
  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();

  try {
    const primarySession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-owner-primary" },
    });
    assert.equal(primarySession.statusCode, 200);
    const primaryAccessToken = primarySession.json().accessToken as string;

    const secondarySession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "chat-owner-secondary" },
    });
    assert.equal(secondarySession.statusCode, 200);
    const secondaryAccessToken = secondarySession.json().accessToken as string;

    const chat = await apiApp.inject({
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
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().id as string;

    const ownerRead = await apiApp.inject({
      method: "GET",
      url: `/v1/chats/${chatId}`,
      headers: {
        authorization: `Bearer ${primaryAccessToken}`,
      },
    });
    assert.equal(ownerRead.statusCode, 200);

    const nonOwnerRead = await apiApp.inject({
      method: "GET",
      url: `/v1/chats/${chatId}`,
      headers: {
        authorization: `Bearer ${secondaryAccessToken}`,
      },
    });
    assert.equal(nonOwnerRead.statusCode, 404);

    const nonOwnerWrite = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${secondaryAccessToken}`,
      },
      payload: {
        content: "这不是我的会话。",
      },
    });
    assert.equal(nonOwnerWrite.statusCode, 404);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("deleted owned object chats stay readable but reject new messages", async () => {
  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "deleted-object-chat" },
    });
    assert.equal(anonymous.statusCode, 200);
    const userId = anonymous.json().userId as string;
    const accessToken = anonymous.json().accessToken as string;

    const personaId = randomUUID();
    const versionId = randomUUID();
    const objectId = randomUUID();

    await sql`
      insert into users (id, display_name)
      values (${userId}::uuid, ${"Guest Builder"})
      on conflict (id) do nothing
    `;
    await sql`
      insert into personae (
        id,
        display_name,
        origin_type,
        persona_type,
        listing_status,
        status,
        creator_user_id
      ) values (
        ${personaId}::uuid,
        ${"测试对象"},
        ${"USER"},
        ${"ORIGINAL_PERSONA"},
        ${"PRIVATE"},
        ${"READY"},
        ${userId}::uuid
      )
    `;
    await sql`
      insert into persona_versions (
        id,
        persona_id,
        version_number,
        status,
        profile_json,
        preview_intro,
        created_by_user_id
      ) values (
        ${versionId}::uuid,
        ${personaId}::uuid,
        1,
        ${"PUBLISHED"},
        ${sql.json({ identity: { name: "测试对象" } })},
        ${"测试简介"},
        ${userId}::uuid
      )
    `;
    await sql`
      insert into owned_persona_objects (
        id,
        owner_user_id,
        persona_id,
        active_persona_version_id,
        display_name,
        intro,
        status
      ) values (
        ${objectId}::uuid,
        ${userId}::uuid,
        ${personaId}::uuid,
        ${versionId}::uuid,
        ${"测试对象"},
        ${"测试简介"},
        ${"READY"}
      )
    `;

    const chat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/chats`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().chatId as string;

    await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "这是一条旧消息。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const deleted = await apiApp.inject({
      method: "DELETE",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(deleted.statusCode, 200);

    const readAfterDelete = await apiApp.inject({
      method: "GET",
      url: `/v1/chats/${chatId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(readAfterDelete.statusCode, 200);
    assert.equal(readAfterDelete.json().messages.length, 1);

    const writeAfterDelete = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        content: "删除后不应该还能继续聊。",
      },
    });
    assert.equal(writeAfterDelete.statusCode, 409);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("old owned object version chats become readonly history after the object version changes", async () => {
  const [{ buildApiApp }] = await Promise.all([import("./app.js")]);
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "changed-object-version-chat" },
    });
    assert.equal(anonymous.statusCode, 200);
    const userId = anonymous.json().userId as string;
    const accessToken = anonymous.json().accessToken as string;

    const personaId = randomUUID();
    const oldVersionId = randomUUID();
    const newVersionId = randomUUID();
    const objectId = randomUUID();

    await sql`
      insert into users (id, display_name)
      values (${userId}::uuid, ${"Guest Builder"})
      on conflict (id) do nothing
    `;
    await sql`
      insert into personae (
        id,
        display_name,
        origin_type,
        persona_type,
        listing_status,
        status,
        creator_user_id
      ) values (
        ${personaId}::uuid,
        ${"换版对象"},
        ${"USER"},
        ${"ORIGINAL_PERSONA"},
        ${"PRIVATE"},
        ${"READY"},
        ${userId}::uuid
      )
    `;
    await sql`
      insert into persona_versions (
        id,
        persona_id,
        version_number,
        status,
        profile_json,
        preview_intro,
        created_by_user_id
      ) values
        (
          ${oldVersionId}::uuid,
          ${personaId}::uuid,
          1,
          ${"PUBLISHED"},
          ${sql.json({ identity: { name: "换版对象" } })},
          ${"旧简介"},
          ${userId}::uuid
        ),
        (
          ${newVersionId}::uuid,
          ${personaId}::uuid,
          2,
          ${"PUBLISHED"},
          ${sql.json({ identity: { name: "换版对象" } })},
          ${"新简介"},
          ${userId}::uuid
        )
    `;
    await sql`
      insert into owned_persona_objects (
        id,
        owner_user_id,
        persona_id,
        active_persona_version_id,
        display_name,
        intro,
        status
      ) values (
        ${objectId}::uuid,
        ${userId}::uuid,
        ${personaId}::uuid,
        ${oldVersionId}::uuid,
        ${"换版对象"},
        ${"旧简介"},
        ${"READY"}
      )
    `;

    const chat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/chats`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().chatId as string;

    await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "这是旧版本聊天。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const activeHistory = await apiApp.inject({
      method: "GET",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(activeHistory.statusCode, 200);
    const activeItem = activeHistory.json().items.find((item: { id: string }) => item.id === chatId);
    assert.equal(activeItem?.ownedObjectId, objectId);

    await sql`
      update owned_persona_objects
      set active_persona_version_id = ${newVersionId}::uuid
      where id = ${objectId}::uuid
    `;

    const oldVersionHistory = await apiApp.inject({
      method: "GET",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(oldVersionHistory.statusCode, 200);
    const oldVersionItem = oldVersionHistory.json().items.find((item: { id: string }) => item.id === chatId);
    assert.ok(oldVersionItem);
    assert.equal(oldVersionItem.ownedObjectId, null);

    const readOldChat = await apiApp.inject({
      method: "GET",
      url: `/v1/chats/${chatId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(readOldChat.statusCode, 200);

    const writeOldChat = await apiApp.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        content: "旧版本不应该继续写。",
      },
    });
    assert.equal(writeOldChat.statusCode, 409);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});
