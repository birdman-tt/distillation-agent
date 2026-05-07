import assert from "node:assert/strict";
import test from "node:test";

import { getSql, resetSqlForTests } from "./db/client.js";

process.env.CHAT_REALTIME_ENABLED = "false";
process.env.PERSONA_DISTILL_KIMI_DISCOVERY_ENABLED = "false";
process.env.PERSONA_DISTILL_SYNTHETIC_DISCOVERY_ENABLED = "false";

test("source discovery API creates pollable jobs without running synchronous discovery", async () => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {},
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const intent = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-intents",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        query: "纪晓岚",
        usageIntent: "chat_companion",
        focus: ["说话方式"],
      },
    });
    assert.equal(intent.statusCode, 200);

    const created = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-source-discovery",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: intent.json().intentId,
        preferredLanguage: "zh-CN",
        maxSourcesPerBucket: 4,
      },
    });
    assert.equal(created.statusCode, 200);
    const createdBody = created.json();
    assert.equal(createdBody.status, "QUEUED");
    assert.equal(createdBody.discovery, null);
    assert.equal(createdBody.discoveryId, null);
    assert.equal(createdBody.nextAction, "POLL_SOURCE_DISCOVERY");
    assert.match(createdBody.pollHref, /^\/v1\/persona-distill-source-discovery-jobs\//u);
    assert.equal("sourceCandidates" in createdBody, false);

    const polled = await apiApp.inject({
      method: "GET",
      url: createdBody.pollHref,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(polled.statusCode, 200);
    assert.equal(polled.json().sourceDiscoveryJobId, createdBody.sourceDiscoveryJobId);
    assert.equal(polled.json().status, "QUEUED");

    const otherAnonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {},
    });
    assert.equal(otherAnonymous.statusCode, 200);
    const otherPoll = await apiApp.inject({
      method: "GET",
      url: createdBody.pollHref,
      headers: {
        authorization: `Bearer ${otherAnonymous.json().accessToken as string}`,
      },
    });
    assert.equal(otherPoll.statusCode, 404);

    await sql`
      update persona_distill_source_discovery_jobs
         set status = 'FAILED',
             current_step = '资料搜索失败',
             progress = 100,
             error_code = 'KIMI_OVERLOADED',
             error_message = 'The engine is currently overloaded, please try again later',
             safe_error_message = '搜索服务繁忙，可以稍后重试',
             retryable = true,
             updated_at = now()
       where id = ${createdBody.sourceDiscoveryJobId}::uuid
    `;

    const failed = await apiApp.inject({
      method: "GET",
      url: createdBody.pollHref,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(failed.statusCode, 200);
    assert.equal(failed.json().status, "FAILED");
    assert.equal(failed.json().error.code, "SOURCE_SEARCH_BUSY");
    assert.equal(failed.json().error.message, "搜索服务繁忙，可以稍后重试");
    assert.equal(failed.body.includes("KIMI_OVERLOADED"), false);
    assert.equal(failed.body.includes("engine is currently overloaded"), false);

    const retried = await apiApp.inject({
      method: "POST",
      url: `${createdBody.pollHref}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(retried.statusCode, 200);
    assert.equal(retried.json().status, "QUEUED");
    assert.notEqual(retried.json().sourceDiscoveryJobId, createdBody.sourceDiscoveryJobId);
    assert.equal(retried.json().nextAction, "POLL_SOURCE_DISCOVERY");

    await sql`
      update persona_distill_source_discovery_jobs
         set status = 'SEARCHING',
             current_step = '搜索公开资料',
             progress = 35,
             updated_at = now()
       where id = ${retried.json().sourceDiscoveryJobId}::uuid
    `;
    const retryReusedActive = await apiApp.inject({
      method: "POST",
      url: `${createdBody.pollHref}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(retryReusedActive.statusCode, 200);
    assert.equal(retryReusedActive.json().sourceDiscoveryJobId, retried.json().sourceDiscoveryJobId);
    assert.equal(retryReusedActive.json().status, "SEARCHING");
    assert.equal(retryReusedActive.json().nextAction, "POLL_SOURCE_DISCOVERY");

    const retryActive = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-distill-source-discovery-jobs/${retried.json().sourceDiscoveryJobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(retryActive.statusCode, 409);
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});
