import assert from "node:assert/strict";
import test from "node:test";

test("anonymous session can create, verify, and continue owning a persona through worker-backed distill", async () => {
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
        personaType: "ORIGINAL_PERSONA",
        originType: "USER",
        distillFocus: ["表达", "判断"],
      },
    });
    assert.equal(createdPersona.statusCode, 200);
    const persona = createdPersona.json();

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

    const reviewWithoutReviewer = await apiApp.inject({
      method: "POST",
      url: `/v1/reviews/sources/${sourceResponse.json().id}/approve`,
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        reason: "should fail",
      },
    });
    assert.equal(reviewWithoutReviewer.statusCode, 403);

    const upgraded = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/web/sms/verify",
      headers: {
        authorization: `Bearer ${anonymousBody.accessToken}`,
      },
      payload: {
        phoneNumber: "13800000000",
        code: "123456",
      },
    });
    assert.equal(upgraded.statusCode, 200);
    const upgradedBody = upgraded.json();

    const reviewer = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/dev/reviewer",
    });
    assert.equal(reviewer.statusCode, 200);
    const reviewerBody = reviewer.json();

    const approved = await apiApp.inject({
      method: "POST",
      url: `/v1/reviews/sources/${sourceResponse.json().id}/approve`,
      headers: {
        authorization: `Bearer ${reviewerBody.accessToken}`,
      },
      payload: {
        reason: "approved",
      },
    });
    assert.equal(approved.statusCode, 200);

    const distilled = await apiApp.inject({
      method: "POST",
      url: `/v1/personae/${persona.id}/distill`,
      headers: {
        authorization: `Bearer ${upgradedBody.accessToken}`,
      },
    });
    assert.equal(distilled.statusCode, 200);
    assert.equal(distilled.json().status, "CANDIDATE");
  } finally {
    await apiApp.close();
    await workerApp.close();
  }
});
