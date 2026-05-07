import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { WebContext } from "@hall-of-fame/kimi-client";

import { getSql, resetSqlForTests } from "./db/client.js";
import { appendChatMessages } from "./store/chat-store.js";

process.env.CHAT_REALTIME_ENABLED = "false";
process.env.CHAT_PLANNER_ENABLED = "false";
process.env.CHAT_PROACTIVE_ENABLED = "false";
process.env.PERSONA_DISTILL_POLLING_ENABLED = "false";
process.env.PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED = "false";
process.env.PERSONA_DISTILL_KIMI_DISCOVERY_ENABLED = "false";
process.env.PERSONA_DISTILL_SYNTHETIC_DISCOVERY_ENABLED = "true";

type ApiApp = Awaited<ReturnType<typeof import("./app.js")["buildApiApp"]>>;
type WorkerApp = { inject: Function };
type TestSourceCandidate = { sourceCandidateId: string; recommended: boolean; riskFlags: string[] };
type TestDiscovery = { discoveryId: string; sourceCandidates: TestSourceCandidate[] };

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("CORS preflight allows object management methods", async () => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();
  try {
    const response = await apiApp.inject({
      method: "OPTIONS",
      url: "/v1/me/objects/00000000-0000-4000-8000-000000000001",
      headers: {
        origin: "http://127.0.0.1:3100",
        "access-control-request-method": "PATCH",
      },
    });
    assert.equal(response.statusCode, 204);
    const allowedMethods = response.headers["access-control-allow-methods"];
    assert.ok(typeof allowedMethods === "string");
    assert.match(allowedMethods, /PATCH/);
    assert.match(allowedMethods, /DELETE/);
  } finally {
    await apiApp.close();
  }
});

const runDueOnce = async (workerApp: WorkerApp) => {
  const response = await workerApp.inject({
    method: "POST",
    url: "/internal/persona-distill/run-due",
  });
  assert.equal(response.statusCode, 200);
  return response;
};

const runDueWithFreshFallback = async (workerApp: WorkerApp) => {
  const response = await runDueOnce(workerApp);
  if (response.json().claimed > 0 || response.json().succeeded > 0 || response.json().failed > 0 || response.json().needsMoreSources > 0) {
    return response;
  }

  const { buildWorkerApp } = await import(new URL("../../worker/src/app.ts", import.meta.url).href);
  const freshWorkerApp = buildWorkerApp();
  try {
    return await runDueOnce(freshWorkerApp);
  } finally {
    await freshWorkerApp.close();
  }
};

const runWorkerUntilJobSucceeded = async (input: {
  apiApp: ApiApp;
  workerApp: WorkerApp;
  accessToken: string;
  jobId: string;
}) => {
  let lastRunDue: Awaited<ReturnType<typeof runDueWithFreshFallback>> | null = null;
  let lastJob = null as Awaited<ReturnType<ApiApp["inject"]>> | null;
  const summarizeJob = (value: Record<string, unknown> | null) =>
    value
      ? {
          jobId: value.jobId,
          status: value.status,
          currentStep: value.currentStep,
          progress: value.progress,
          error: value.error,
        }
      : null;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    lastRunDue = await runDueWithFreshFallback(input.workerApp);
    lastJob = await input.apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${input.jobId}`,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
    });
    assert.equal(lastJob.statusCode, 200);

    const status = lastJob.json().status;
    if (status === "SUCCEEDED") {
      return {
        runDue: lastRunDue,
        completed: lastJob,
      };
    }
    if (status === "FAILED" || status === "NEEDS_MORE_SOURCES" || status === "BLOCKED") {
      throw new Error(JSON.stringify({ runDue: lastRunDue.json(), job: summarizeJob(lastJob.json()) }));
    }

    await wait(1_000);
  }

  throw new Error(JSON.stringify({ runDue: lastRunDue?.json(), job: summarizeJob(lastJob?.json() ?? null) }));
};

const buildTestWebContext = (query: string): WebContext => ({
  query: `${query} 公开资料 访谈 作品`,
  freshnessStatus: "fresh",
  keyFindings: [
    `${query} 有可追溯的公开资料。`,
    `${query} 有表达、经历和作品相关资料。`,
  ],
  sources: [
    {
      title: `${query} 官方访谈原文`,
      url: `https://example.com/${encodeURIComponent(query)}/interview`,
      publishedAt: null,
      snippet: `${query} 的官方采访原文，包含说话方式、判断顺序和表达习惯。`,
    },
    {
      title: `${query} 生平时间线`,
      url: `https://example.com/${encodeURIComponent(query)}/timeline`,
      publishedAt: null,
      snippet: `${query} 的生平经历、时间线和关键事件。`,
    },
    {
      title: `${query} 代表作品与决定`,
      url: `https://example.com/${encodeURIComponent(query)}/works`,
      publishedAt: null,
      snippet: `${query} 的作品、决定、行动和价值判断资料。`,
    },
    {
      title: `${query} 表达风格分析`,
      url: `https://example.com/${encodeURIComponent(query)}/style`,
      publishedAt: null,
      snippet: `${query} 的说话风格、文风、口头表达和表达 DNA。`,
    },
  ],
  uncertainty: null,
});

const completeSourceDiscoveryJob = async (input: {
  apiApp: ApiApp;
  accessToken: string;
  sourceDiscoveryJobId: string;
  pollHref: string;
  query: string;
}) => {
  const { runDuePersonaSourceDiscoveryJobs } = await import(
    new URL("../../worker/src/jobs/persona-source-discovery/run-persona-source-discovery-jobs.ts", import.meta.url).href
  );
  const result = await runDuePersonaSourceDiscoveryJobs({
    onlyJobIds: [input.sourceDiscoveryJobId],
    researcher: async () => buildTestWebContext(input.query),
    createId: randomUUID,
  });
  assert.equal(result.claimed, 1);
  assert.equal(result.succeeded, 1);

  const completed = await input.apiApp.inject({
    method: "GET",
    url: input.pollHref,
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().status, "SUCCEEDED");
  assert.ok(completed.json().discovery);
  assert.ok(completed.json().discovery.sourceCandidates.length >= 3);
  return completed.json().discovery as TestDiscovery;
};

const createCompletedSourceDiscovery = async (input: {
  apiApp: ApiApp;
  accessToken: string;
  intentId: string;
  query: string;
}) => {
  const discoveryJob = await input.apiApp.inject({
    method: "POST",
    url: "/v1/persona-distill-source-discovery",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
    payload: {
      intentId: input.intentId,
      preferredLanguage: "zh-CN",
      maxSourcesPerBucket: 4,
    },
  });
  assert.equal(discoveryJob.statusCode, 200);
  assert.equal(discoveryJob.json().status, "QUEUED");

  return completeSourceDiscoveryJob({
    apiApp: input.apiApp,
    accessToken: input.accessToken,
    sourceDiscoveryJobId: discoveryJob.json().sourceDiscoveryJobId,
    pollHref: discoveryJob.json().pollHref,
    query: input.query,
  });
};

const createDistillCandidate = async (input: {
  apiApp: ApiApp;
  workerApp: WorkerApp;
  accessToken: string;
  query: string;
  includeExtraPrimarySource?: boolean;
}) => {
  const intent = await input.apiApp.inject({
    method: "POST",
    url: "/v1/persona-distill-intents",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
    payload: {
      query: input.query,
      usageIntent: "chat_companion",
      focus: ["说话方式", "思考方式"],
    },
  });
  assert.equal(intent.statusCode, 200);
  assert.equal(intent.json().riskDecision, "ALLOW");

  const discovery = await createCompletedSourceDiscovery({
    apiApp: input.apiApp,
    accessToken: input.accessToken,
    intentId: intent.json().intentId,
    query: input.query,
  });

  let selectedExtraSourceIds: string[] = [];
  if (input.includeExtraPrimarySource) {
    const extraSources = await input.apiApp.inject({
      method: "POST",
      url: `/v1/persona-distill-discoveries/${discovery.discoveryId}/extra-sources`,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
      payload: {
        extraTextSources: [
          {
            title: `${input.query} 的原始表达片段`,
            content:
              "这是一段用户补充的原始表达资料，包含对象的说话方式、判断顺序、价值取向和行为边界，长度足够用于蒸馏质量验证。",
            sourceKind: "PRIMARY",
          },
        ],
        extraUrlSources: [],
      },
    });
    assert.equal(extraSources.statusCode, 200);
    selectedExtraSourceIds = extraSources
      .json()
      .pendingExtraSources.filter((item: { status: string }) => item.status === "USABLE")
      .map((item: { extraSourceId: string }) => item.extraSourceId);
    assert.ok(selectedExtraSourceIds.length >= 1);
  }

  const selectedSourceCandidateIds = discovery
    .sourceCandidates.filter((item: { recommended: boolean; riskFlags: string[] }) => item.recommended && item.riskFlags.length === 0)
    .slice(0, 3)
    .map((item: { sourceCandidateId: string }) => item.sourceCandidateId);

  const job = await input.apiApp.inject({
    method: "POST",
    url: "/v1/persona-distill-jobs",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
    payload: {
      intentId: intent.json().intentId,
      discoveryId: discovery.discoveryId,
      selectedSourceCandidateIds,
      selectedExtraSourceIds,
    },
  });
  assert.equal(job.statusCode, 200);
  assert.equal(job.json().status, "QUEUED");
  assert.ok(job.json().objectId);
  assert.equal(job.json().objectHref, `/profile/objects/${job.json().objectId}`);
  assert.equal("qualityScores" in job.json(), false);

  const { completed } = await runWorkerUntilJobSucceeded({
    apiApp: input.apiApp,
    workerApp: input.workerApp,
    accessToken: input.accessToken,
    jobId: job.json().jobId,
  });
  assert.ok(completed.json().resultVersionId);
  assert.equal(completed.json().objectId, job.json().objectId);
  assert.equal(completed.json().objectHref, job.json().objectHref);
  assert.equal("qualityScores" in completed.json(), false);

  return {
    jobId: job.json().jobId as string,
    objectId: job.json().objectId as string,
    objectHref: job.json().objectHref as string,
    personaId: completed.json().personaId as string,
    resultVersionId: completed.json().resultVersionId as string,
  };
};

const createQueuedDistillJob = async (input: {
  apiApp: ApiApp;
  accessToken: string;
  query: string;
}) => {
  const intent = await input.apiApp.inject({
    method: "POST",
    url: "/v1/persona-distill-intents",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
    payload: {
      query: input.query,
      usageIntent: "chat_companion",
      focus: ["说话方式", "思考方式"],
    },
  });
  assert.equal(intent.statusCode, 200);

  const discovery = await createCompletedSourceDiscovery({
    apiApp: input.apiApp,
    accessToken: input.accessToken,
    intentId: intent.json().intentId,
    query: input.query,
  });

  const selectedSourceCandidateIds = discovery
    .sourceCandidates.filter((item: { recommended: boolean; riskFlags: string[] }) => item.recommended && item.riskFlags.length === 0)
    .slice(0, 3)
    .map((item: { sourceCandidateId: string }) => item.sourceCandidateId);

  const job = await input.apiApp.inject({
    method: "POST",
    url: "/v1/persona-distill-jobs",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
    payload: {
      intentId: intent.json().intentId,
      discoveryId: discovery.discoveryId,
      selectedSourceCandidateIds,
      selectedExtraSourceIds: [],
    },
  });
  assert.equal(job.statusCode, 200);
  assert.equal(job.json().status, "QUEUED");
  assert.ok(job.json().objectId);
  assert.equal(job.json().objectHref, `/profile/objects/${job.json().objectId}`);

  return {
    jobId: job.json().jobId as string,
    objectId: job.json().objectId as string,
    objectHref: job.json().objectHref as string,
    personaId: job.json().personaId as string,
  };
};

test("creating my object cannot be edited before distill completes", async () => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-creating-object-edit" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const queued = await createQueuedDistillJob({
      apiApp,
      accessToken,
      query: "排队中的对象",
    });

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const creatingItem = inventory
      .json()
      .items.find((item: { status: string; primaryHref: string }) => item.status === "CREATING" && item.primaryHref === `/create?jobId=${queued.jobId}`);
    assert.ok(creatingItem);

    const detail = await apiApp.inject({
      method: "GET",
      url: `/v1/me/objects/${creatingItem.objectId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().status, "CREATING");
    assert.deepEqual(detail.json().editableFields, []);

    const edited = await apiApp.inject({
      method: "PATCH",
      url: `/v1/me/objects/${creatingItem.objectId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        displayName: "不应被编辑",
      },
    });
    assert.equal(edited.statusCode, 400);
    assert.equal(edited.json().message, "对象还在生成，完成后再编辑。");
    assert.equal(edited.json().object.status, "CREATING");
    assert.deepEqual(edited.json().object.editableFields, []);

    const deleted = await apiApp.inject({
      method: "DELETE",
      url: `/v1/me/objects/${creatingItem.objectId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(deleted.statusCode, 400);
    assert.equal(deleted.json().message, "对象还在生成，完成后再删除。");
    assert.equal(deleted.json().object.status, "CREATING");

    const detailAfterDeleteAttempt = await apiApp.inject({
      method: "GET",
      url: `/v1/me/objects/${creatingItem.objectId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(detailAfterDeleteAttempt.statusCode, 200);
    assert.equal(detailAfterDeleteAttempt.json().status, "CREATING");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("one-click distill job produces a recoverable owner inventory candidate and publish transitions", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-primary" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken,
      query: "测试蒸馏对象",
      includeExtraPrimarySource: true,
    });

    const toolRuns = await sql<{ toolName: string; status: string }[]>`
      select tool_name as "toolName", status
      from persona_distill_tool_runs
      where job_id = ${candidate.jobId}::uuid
      order by seq asc
    `;
    assert.deepEqual(toolRuns.map((item) => item.toolName), [
      "check_distill_intent_risk",
      "search_sources",
      "clean_sources",
      "extract_evidence",
      "score_source_coverage",
      "generate_persona_profile",
      "validate_persona_profile",
      "persist_persona_candidate",
    ]);
    assert.deepEqual([...new Set(toolRuns.map((item) => item.status))], ["SUCCEEDED"]);

    const completedJob = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(completedJob.statusCode, 200);
    for (const key of ["toolRuns", "plannerModel", "modelProvider", "runtimeState", "qualityScores"]) {
      assert.equal(key in completedJob.json(), false);
    }

    const personaRows = await sql<{ current_draft_version_id: string | null }[]>`
      select current_draft_version_id
      from personae
      where id = ${candidate.personaId}::uuid
    `;
    assert.equal(personaRows[0]?.current_draft_version_id, null, "candidate must not be saved as current draft before user action");

    const anonymousVersionsBeforePublish = await apiApp.inject({
      method: "GET",
      url: `/v1/personae/${candidate.personaId}/versions`,
    });
    assert.equal(anonymousVersionsBeforePublish.statusCode, 200);
    assert.deepEqual(anonymousVersionsBeforePublish.json().items, []);

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const candidateItem = inventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(candidateItem);
    assert.ok(candidateItem.objectId);
    assert.equal(candidateItem.status, "PENDING_CONFIRM");
    assert.equal(candidateItem.primaryHref, `/preview/${candidate.resultVersionId}`);
    assert.equal(candidateItem.availableActions.includes("CONFIRM"), true);
    assert.equal("qualitySummary" in candidateItem, false);
    assert.equal("coverageScore" in candidateItem, false);
    assert.equal("styleScore" in candidateItem, false);
    assert.equal("publishGate" in candidateItem, false);
    for (const key of ["toolRuns", "plannerModel", "modelProvider", "runtimeState"]) {
      assert.equal(key in candidateItem, false);
    }
    const objectId = candidateItem.objectId as string;

    const version = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-versions/${candidate.resultVersionId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(version.statusCode, 200);
    assert.equal(version.json().personaId, candidate.personaId);
    assert.equal(version.json().addSourcesHref, `/create?jobId=${candidate.jobId}&mode=addSources`);
    assert.equal(version.json().ownerDisplayStatus, "CANDIDATE");
    assert.equal("sourceDistillJobId" in version.json(), false);
    assert.equal("coverageScore" in version.json(), false);
    assert.equal("styleScore" in version.json(), false);
    assert.equal("publishGate" in version.json(), false);
    for (const key of ["toolRuns", "plannerModel", "modelProvider", "runtimeState"]) {
      assert.equal(key in version.json(), false);
    }

    const savedPrivate = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${candidate.resultVersionId}/publish`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        visibility: "PRIVATE",
      },
    });
    assert.equal(savedPrivate.statusCode, 200);

    const privateInventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(privateInventory.statusCode, 200);
    const privateItem = privateInventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(privateItem);
    assert.equal(privateItem.objectId, objectId);
    assert.equal(privateItem.status, "READY");
    assert.equal(privateItem.primaryHref, `/preview/${candidate.resultVersionId}`);
    assert.equal(privateItem.availableActions.includes("DELETE"), false);

    const published = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${candidate.resultVersionId}/publish`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        visibility: "PUBLIC",
      },
    });
    assert.equal(published.statusCode, 200);
    assert.ok(published.json().share?.shareSlug);

    const publicInventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(publicInventory.statusCode, 200);
    const publicItem = publicInventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(publicItem);
    assert.equal(publicItem.objectId, objectId);
    assert.equal(publicItem.status, "PUBLIC");
    assert.equal(publicItem.primaryHref, `/persona/${candidate.personaId}`);
    assert.equal(publicItem.availableActions.includes("SHARE"), true);
    assert.equal(publicItem.availableActions.includes("DELETE"), false);
    assert.equal(publicInventory.json().groups.ready.length, 0);

    const publicDetail = await apiApp.inject({
      method: "GET",
      url: `/v1/personae/${candidate.personaId}`,
    });
    assert.equal(publicDetail.statusCode, 200);
    assert.equal(publicDetail.json().persona.currentPublishedVersionId, candidate.resultVersionId);

    const publicVersion = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-versions/${candidate.resultVersionId}`,
    });
    assert.equal(publicVersion.statusCode, 200);
    assert.equal(publicVersion.json().ownerDisplayStatus, "PUBLIC");
    assert.equal(publicVersion.json().addSourcesHref, null);
    assert.equal("sourceDistillJobId" in publicVersion.json(), false);
    assert.equal("publishGate" in publicVersion.json(), false);

    const anonymousVersionsAfterPublish = await apiApp.inject({
      method: "GET",
      url: `/v1/personae/${candidate.personaId}/versions`,
    });
    assert.equal(anonymousVersionsAfterPublish.statusCode, 200);
    assert.equal(anonymousVersionsAfterPublish.json().items.length, 1);
    assert.equal(anonymousVersionsAfterPublish.json().items[0].id, candidate.resultVersionId);
    assert.equal("sourceDistillJobId" in anonymousVersionsAfterPublish.json().items[0], false);
    assert.equal("publishGate" in anonymousVersionsAfterPublish.json().items[0], false);
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("distill job trace is owner-only, debug-gated, ordered, and sanitized", async () => {
  const originalTraceEnabled = process.env.PERSONA_DISTILL_TRACE_API_ENABLED;
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.PERSONA_DISTILL_TRACE_API_ENABLED = "true";
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-trace-owner" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken,
      query: "日志追踪对象",
      includeExtraPrimarySource: true,
    });

    await sql`
      insert into persona_distill_artifacts (
        id,
        job_id,
        stage,
        artifact_json
      ) values (
        ${randomUUID()}::uuid,
        ${candidate.jobId}::uuid,
        ${"debug_probe"},
        ${sql.json({ content: "sensitive artifact body", safe: "visible" })}
      )
    `;

    const trace = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}/trace`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(trace.statusCode, 200);
    assert.equal(trace.json().jobId, candidate.jobId);
    assert.equal(trace.json().status, "SUCCEEDED");
    assert.ok(trace.json().events.length >= trace.json().runs.length);
    assert.deepEqual(
      trace.json().runs.map((item: { seq: number }) => item.seq),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(trace.json().runs[0].durationMs >= 0, true);
    assert.equal(trace.json().runs[0].input.intentId.length > 0, true);
    assert.equal(trace.json().runs[0].output.summary, "风险判断已通过。");
    const debugArtifact = trace.json().artifacts.find((item: { stage: string }) => item.stage === "debug_probe");
    assert.deepEqual(debugArtifact.artifact, {
      content: "[redacted]",
      safe: "visible",
    });

    const otherAnonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-trace-other" },
    });
    assert.equal(otherAnonymous.statusCode, 200);
    const otherTrace = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}/trace`,
      headers: {
        authorization: `Bearer ${otherAnonymous.json().accessToken}`,
      },
    });
    assert.equal(otherTrace.statusCode, 404);

    process.env.PERSONA_DISTILL_TRACE_API_ENABLED = "false";
    const disabledTrace = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}/trace`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(disabledTrace.statusCode, 404);
  } finally {
    if (originalTraceEnabled === undefined) {
      delete process.env.PERSONA_DISTILL_TRACE_API_ENABLED;
    } else {
      process.env.PERSONA_DISTILL_TRACE_API_ENABLED = originalTraceEnabled;
    }
    if (originalDeepSeekApiKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    }
    await apiApp.close();
    await workerApp.close();
    await resetSqlForTests();
  }
});

test("candidate versions can be discarded from owner inventory before saving", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-discard" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken,
      query: "可放弃对象",
    });

    const inventoryBeforeDiscard = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventoryBeforeDiscard.statusCode, 200);
    const candidateInventoryItem = inventoryBeforeDiscard
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(candidateInventoryItem);
    assert.ok(candidateInventoryItem.objectId);
    assert.equal(candidateInventoryItem.status, "PENDING_CONFIRM");
    assert.equal(candidateInventoryItem.availableActions.includes("PUBLISH"), false);
    assert.equal("qualitySummary" in candidateInventoryItem, false);
    const objectId = candidateInventoryItem.objectId as string;

    const discard = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${candidate.resultVersionId}/discard`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(discard.statusCode, 200);
    assert.equal(discard.json().status, "REJECTED");

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    assert.equal(inventory.json().items.some((item: { objectId: string }) => item.objectId === objectId), false);
    assert.equal(inventory.json().items.some((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId), false);
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("my object detail management api keeps object semantics without internal ids", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();

  try {
    const ownerSession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "my-object-detail-owner" },
    });
    assert.equal(ownerSession.statusCode, 200);
    const ownerToken = ownerSession.json().accessToken as string;

    const otherSession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "my-object-detail-other" },
    });
    assert.equal(otherSession.statusCode, 200);
    const otherToken = otherSession.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken: ownerToken,
      query: "对象详情管理测试",
      includeExtraPrimarySource: true,
    });

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const inventoryItem = inventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(inventoryItem);
    const objectId = inventoryItem.objectId as string;

    const otherDetail = await apiApp.inject({
      method: "GET",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${otherToken}`,
      },
    });
    assert.equal(otherDetail.statusCode, 404);

    const detail = await apiApp.inject({
      method: "GET",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().objectId, objectId);
    assert.equal(detail.json().status, "PENDING_CONFIRM");
    assert.equal(detail.json().availableActions.includes("CONFIRM"), true);
    assert.equal(detail.json().availableActions.includes("DELETE"), true);
    for (const key of [
      "personaId",
      "personaVersionId",
      "sourceDistillJobId",
      "coverageScore",
      "styleScore",
      "publishGate",
      "toolRuns",
      "plannerModel",
      "modelProvider",
      "runtimeState",
    ]) {
      assert.equal(key in detail.json(), false);
    }

    const updated = await apiApp.inject({
      method: "PATCH",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        displayName: "新的对象名",
        intro: "只展示一句有用简介",
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().object.displayName, "新的对象名");
    assert.equal(updated.json().object.intro, "只展示一句有用简介");
    assert.equal("personaVersionId" in updated.json().object, false);

    const confirmed = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/confirm`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().message, "已保存到我的对象。");
    assert.equal(confirmed.json().object.status, "READY");
    assert.equal(confirmed.json().object.chatHref, `/profile/objects/${objectId}/chat`);
    assert.equal(confirmed.json().object.availableActions.includes("DELETE"), true);

    const published = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/publish`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(published.statusCode, 200);
    assert.equal(published.json().message, "已公开分享。");
    assert.equal(published.json().object.status, "PUBLIC");
    assert.equal(published.json().object.chatHref, `/profile/objects/${objectId}/chat`);
    assert.equal(published.json().object.availableActions.includes("DELETE"), true);
    assert.ok(published.json().share?.shareHref);
    assert.ok(published.json().share?.canonicalUrl);
    assert.ok(published.json().share?.miniappPath);
    for (const key of ["id", "personaVersionId", "isPrimary", "isActive"]) {
      assert.equal(key in published.json().share, false);
    }

    const inventoryAfterUpdate = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(inventoryAfterUpdate.statusCode, 200);
    const updatedInventoryItem = inventoryAfterUpdate
      .json()
      .items.find((item: { objectId: string }) => item.objectId === objectId);
    assert.ok(updatedInventoryItem);
    assert.equal(updatedInventoryItem.displayName, "新的对象名");
    assert.equal(updatedInventoryItem.intro, "只展示一句有用简介");
    assert.equal(updatedInventoryItem.availableActions.includes("DELETE"), false);

    const deleted = await apiApp.inject({
      method: "DELETE",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json().objectId, objectId);
    assert.equal(deleted.json().deleted, true);

    const detailAfterDelete = await apiApp.inject({
      method: "GET",
      url: `/v1/me/objects/${objectId}`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(detailAfterDelete.statusCode, 404);

    const inventoryAfterDelete = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(inventoryAfterDelete.statusCode, 200);
    assert.equal(
      inventoryAfterDelete.json().items.some((item: { objectId: string }) => item.objectId === objectId),
      false,
    );
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("my object chat endpoint creates a chat without leaking target ids", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();

  try {
    const ownerSession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "my-object-chat-owner" },
    });
    assert.equal(ownerSession.statusCode, 200);
    const ownerToken = ownerSession.json().accessToken as string;

    const otherSession = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "my-object-chat-other" },
    });
    assert.equal(otherSession.statusCode, 200);
    const otherToken = otherSession.json().accessToken as string;

    const queued = await createQueuedDistillJob({
      apiApp,
      accessToken: ownerToken,
      query: "聊天入口排队对象",
    });
    const creatingInventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(creatingInventory.statusCode, 200);
    const creatingItem = creatingInventory
      .json()
      .items.find((item: { status: string; primaryHref: string }) => item.status === "CREATING" && item.primaryHref === `/create?jobId=${queued.jobId}`);
    assert.ok(creatingItem);

    const creatingChat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${creatingItem.objectId}/chats`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(creatingChat.statusCode, 400);
    assert.equal(creatingChat.json().message, "对象还不能聊天。");

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken: ownerToken,
      query: "对象聊天入口测试",
      includeExtraPrimarySource: true,
    });

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const inventoryItem = inventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(inventoryItem);
    const objectId = inventoryItem.objectId as string;

    const otherChat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/chats`,
      headers: {
        authorization: `Bearer ${otherToken}`,
      },
    });
    assert.equal(otherChat.statusCode, 404);

    const pendingChat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/chats`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(pendingChat.statusCode, 400);
    assert.equal(pendingChat.json().message, "对象还不能聊天。");

    const confirmed = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/confirm`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(confirmed.statusCode, 200);

    const chat = await apiApp.inject({
      method: "POST",
      url: `/v1/me/objects/${objectId}/chats`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(chat.statusCode, 200);
    const chatId = chat.json().chatId as string;
    assert.ok(chatId);
    for (const key of ["targetType", "targetPersonaId", "targetPersonaVersionId", "personaVersionId"]) {
      assert.equal(key in chat.json(), false);
    }

    await appendChatMessages(chatId, [
      {
        id: randomUUID(),
        role: "USER",
        content: "从这里继续聊。",
        basis: null,
        basisSummary: null,
        inferenceLevel: null,
        conflictDetected: null,
        refusalReason: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const chatHistory = await apiApp.inject({
      method: "GET",
      url: "/v1/chats",
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(chatHistory.statusCode, 200);
    const historyItem = chatHistory.json().items.find((item: { id: string }) => item.id === chatId);
    assert.ok(historyItem);
    assert.equal(historyItem.ownedObjectId, objectId);
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("adding sources to a completed job reuses the persona and replaces the old candidate", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-add-sources-retry" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken,
      query: "补资料重蒸对象",
    });

    const completedJob = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(completedJob.statusCode, 200);

    const initialInventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(initialInventory.statusCode, 200);
    const initialItem = initialInventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId);
    assert.ok(initialItem);
    const initialObjectId = initialItem.objectId as string;

    const extraSources = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-distill-discoveries/${completedJob.json().discovery.discoveryId}/extra-sources`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        extraTextSources: [
          {
            title: "补资料重蒸对象的高可信表达片段",
            content:
              "这是一段补充的高可信原始表达资料，明确描述对象的语气、判断顺序、情绪反应、长期偏好和不应该越界的表达方式。",
            sourceKind: "PRIMARY",
          },
        ],
        extraUrlSources: [],
      },
    });
    assert.equal(extraSources.statusCode, 200);
    const selectedExtraSourceIds = extraSources
      .json()
      .pendingExtraSources.filter((item: { status: string }) => item.status === "USABLE")
      .map((item: { extraSourceId: string }) => item.extraSourceId);
    assert.ok(selectedExtraSourceIds.length >= 1);

    const retryJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: completedJob.json().intent.intentId,
        discoveryId: completedJob.json().discovery.discoveryId,
        selectedSourceCandidateIds: completedJob.json().selectedSourceCandidateIds,
        selectedExtraSourceIds,
      },
    });
    assert.equal(retryJob.statusCode, 200);
    assert.equal(retryJob.json().status, "QUEUED");
    assert.equal(retryJob.json().personaId, candidate.personaId);
    assert.equal(retryJob.json().objectId, initialObjectId);
    assert.equal(retryJob.json().objectHref, `/profile/objects/${initialObjectId}`);

    const { completed: completedRetry } = await runWorkerUntilJobSucceeded({
      apiApp,
      workerApp,
      accessToken,
      jobId: retryJob.json().jobId,
    });
    assert.equal(completedRetry.json().personaId, candidate.personaId);
    assert.notEqual(completedRetry.json().resultVersionId, candidate.resultVersionId);
    assert.equal(completedRetry.json().objectId, initialObjectId);
    assert.equal(completedRetry.json().objectHref, `/profile/objects/${initialObjectId}`);

    const oldVersionRows = await sql<{ status: string }[]>`
      select status
      from persona_versions
      where id = ${candidate.resultVersionId}::uuid
    `;
    assert.equal(oldVersionRows[0]?.status, "SUPERSEDED");

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const refinedItem = inventory
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === completedRetry.json().resultVersionId);
    assert.equal(
      inventory.json().items.some((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId),
      false,
    );
    assert.ok(refinedItem);
    assert.equal(refinedItem.objectId, initialObjectId);
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("private saved versions stay available until the refined candidate is explicitly saved", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-private-refine" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const candidate = await createDistillCandidate({
      apiApp,
      workerApp,
      accessToken,
      query: "私用补资料对象",
    });

    const savePrivate = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${candidate.resultVersionId}/publish`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        visibility: "PRIVATE",
      },
    });
    assert.equal(savePrivate.statusCode, 200);

    const completedJob = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${candidate.jobId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(completedJob.statusCode, 200);

    const extraSources = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-distill-discoveries/${completedJob.json().discovery.discoveryId}/extra-sources`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        extraTextSources: [
          {
            title: "私用补资料对象的补充表达片段",
            content:
              "这是用于重蒸私用对象的补充资料，包含对象的表达节奏、典型判断、情绪反应、长期关注点和明确的回答边界。",
            sourceKind: "PRIMARY",
          },
        ],
        extraUrlSources: [],
      },
    });
    assert.equal(extraSources.statusCode, 200);
    const selectedExtraSourceIds = extraSources
      .json()
      .pendingExtraSources.filter((item: { status: string }) => item.status === "USABLE")
      .map((item: { extraSourceId: string }) => item.extraSourceId);
    assert.ok(selectedExtraSourceIds.length >= 1);

    const retryJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: completedJob.json().intent.intentId,
        discoveryId: completedJob.json().discovery.discoveryId,
        selectedSourceCandidateIds: completedJob.json().selectedSourceCandidateIds,
        selectedExtraSourceIds,
      },
    });
    assert.equal(retryJob.statusCode, 200);
    assert.equal(retryJob.json().personaId, candidate.personaId);

    const { completed: completedRetry } = await runWorkerUntilJobSucceeded({
      apiApp,
      workerApp,
      accessToken,
      jobId: retryJob.json().jobId,
    });

    const personaAfterRefine = await sql<{ currentDraftVersionId: string | null }[]>`
      select current_draft_version_id as "currentDraftVersionId"
      from personae
      where id = ${candidate.personaId}::uuid
    `;
    assert.equal(personaAfterRefine[0]?.currentDraftVersionId, candidate.resultVersionId);

    const oldVersionBeforeAccept = await sql<{ status: string }[]>`
      select status
      from persona_versions
      where id = ${candidate.resultVersionId}::uuid
    `;
    assert.equal(oldVersionBeforeAccept[0]?.status, "CANDIDATE");

    const inventoryBeforeAccept = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventoryBeforeAccept.statusCode, 200);
    const refinedItem = inventoryBeforeAccept
      .json()
      .items.find((item: { personaVersionId: string | null }) => item.personaVersionId === completedRetry.json().resultVersionId);
    assert.ok(refinedItem);
    assert.equal(refinedItem.status, "PENDING_CONFIRM");
    assert.equal(
      inventoryBeforeAccept.json().items.some((item: { personaVersionId: string | null }) => item.personaVersionId === candidate.resultVersionId),
      false,
    );

    const saveRefinedPrivate = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-versions/${completedRetry.json().resultVersionId}/publish`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        visibility: "PRIVATE",
      },
    });
    assert.equal(saveRefinedPrivate.statusCode, 200);

    const oldVersionAfterAccept = await sql<{ status: string }[]>`
      select status
      from persona_versions
      where id = ${candidate.resultVersionId}::uuid
    `;
    assert.equal(oldVersionAfterAccept[0]?.status, "SUPERSEDED");
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("distill jobs ignore extra sources from a different discovery", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-cross-discovery" },
    });
    assert.equal(anonymous.statusCode, 200);
    const accessToken = anonymous.json().accessToken as string;

    const createIntent = async (query: string) => {
      const intent = await apiApp.inject({
        method: "POST",
        url: "/v1/persona-distill-intents",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          query,
          usageIntent: "chat_companion",
          focus: ["说话方式"],
        },
      });
      assert.equal(intent.statusCode, 200);
      return intent.json();
    };

    const sourceIntent = await createIntent("主对象资料");
    const sourceDiscovery = await createCompletedSourceDiscovery({
      apiApp,
      accessToken,
      intentId: sourceIntent.intentId,
      query: sourceIntent.normalizedName ?? "主对象资料",
    });

    const foreignIntent = await createIntent("外部污染对象");
    const foreignDiscovery = await createCompletedSourceDiscovery({
      apiApp,
      accessToken,
      intentId: foreignIntent.intentId,
      query: foreignIntent.normalizedName ?? "外部污染对象",
    });

    const foreignTitle = "不应进入主对象的跨 discovery 资料";
    const foreignExtra = await apiApp.inject({
      method: "POST",
      url: `/v1/persona-distill-discoveries/${foreignDiscovery.discoveryId}/extra-sources`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        extraTextSources: [
          {
            title: foreignTitle,
            content: "这段资料属于另一个 discovery，不应该被主对象蒸馏任务加载，否则会污染人物资料边界。",
            sourceKind: "PRIMARY",
          },
        ],
        extraUrlSources: [],
      },
    });
    assert.equal(foreignExtra.statusCode, 200);
    const foreignUsableExtra = foreignExtra
      .json()
      .pendingExtraSources.find((item: { status: string }) => item.status === "USABLE") as { extraSourceId: string } | undefined;
    assert.ok(foreignUsableExtra);
    const foreignExtraSourceId = foreignUsableExtra.extraSourceId;

    const selectedSourceCandidateIds = sourceDiscovery
      .sourceCandidates.filter((item: { recommended: boolean; riskFlags: string[] }) => item.recommended && item.riskFlags.length === 0)
      .slice(0, 3)
      .map((item: { sourceCandidateId: string }) => item.sourceCandidateId);
    assert.equal(selectedSourceCandidateIds.length, 3);

    const job = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: sourceIntent.intentId,
        discoveryId: sourceDiscovery.discoveryId,
        selectedSourceCandidateIds,
        selectedExtraSourceIds: [foreignExtraSourceId],
      },
    });
    assert.equal(job.statusCode, 200);
    assert.deepEqual(job.json().selectedExtraSourceIds, []);

    const { completed } = await runWorkerUntilJobSucceeded({
      apiApp,
      workerApp,
      accessToken,
      jobId: job.json().jobId,
    });

    const pollutedSources = await sql<{ count: string }[]>`
      select count(*)::text as count
      from persona_sources
      where persona_id = ${completed.json().personaId}::uuid
        and source_title = ${foreignTitle}
    `;
    assert.equal(pollutedSources[0]?.count, "0");
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});

test("creating the same active distill job is idempotent", async () => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-active-idempotency" },
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
        query: "重复提交对象",
        usageIntent: "chat_companion",
        focus: ["说话方式"],
      },
    });
    assert.equal(intent.statusCode, 200);

    const discovery = await createCompletedSourceDiscovery({
      apiApp,
      accessToken,
      intentId: intent.json().intentId,
      query: "重复提交对象",
    });
    const selectedSourceCandidateIds = discovery
      .sourceCandidates.filter((item: { recommended: boolean; riskFlags: string[] }) => item.recommended && item.riskFlags.length === 0)
      .slice(0, 3)
      .map((item: { sourceCandidateId: string }) => item.sourceCandidateId);
    assert.equal(selectedSourceCandidateIds.length, 3);

    const payload = {
      intentId: intent.json().intentId,
      discoveryId: discovery.discoveryId,
      selectedSourceCandidateIds,
      selectedExtraSourceIds: [],
    };
    const firstJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload,
    });
    assert.equal(firstJob.statusCode, 200);
    assert.equal(firstJob.json().status, "QUEUED");

    const secondJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload,
    });
    assert.equal(secondJob.statusCode, 200);
    assert.equal(secondJob.json().jobId, firstJob.json().jobId);
    assert.equal(secondJob.json().personaId, firstJob.json().personaId);

    const jobRows = await sql<{ count: string; personaCount: string }[]>`
      select
        count(*)::text as count,
        count(distinct persona_id)::text as "personaCount"
      from persona_distill_jobs
      where intent_id = ${intent.json().intentId}::uuid
        and discovery_id = ${discovery.discoveryId}::uuid
    `;
    assert.equal(jobRows[0]?.count, "1");
    assert.equal(jobRows[0]?.personaCount, "1");
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("retrying a source-deficient discovery supersedes the previous job", async () => {
  const { buildApiApp } = await import("./app.js");
  const apiApp = buildApiApp();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-retry" },
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
        query: "需要补资料对象",
        usageIntent: "chat_companion",
        focus: ["说话方式"],
      },
    });
    assert.equal(intent.statusCode, 200);

    const discovery = await createCompletedSourceDiscovery({
      apiApp,
      accessToken,
      intentId: intent.json().intentId,
      query: "需要补资料对象",
    });
    const candidateIds = discovery
      .sourceCandidates.map((item: { sourceCandidateId: string }) => item.sourceCandidateId);

    const firstJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: intent.json().intentId,
        discoveryId: discovery.discoveryId,
        selectedSourceCandidateIds: candidateIds.slice(0, 1),
        selectedExtraSourceIds: [],
      },
    });
    assert.equal(firstJob.statusCode, 200);
    assert.equal(firstJob.json().status, "NEEDS_MORE_SOURCES");

    const retryJob = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: intent.json().intentId,
        discoveryId: discovery.discoveryId,
        selectedSourceCandidateIds: candidateIds.slice(0, 3),
        selectedExtraSourceIds: [],
      },
    });
    assert.equal(retryJob.statusCode, 200);
    assert.equal(retryJob.json().status, "QUEUED");

    const oldJob = await apiApp.inject({
      method: "GET",
      url: `/v1/persona-distill-jobs/${firstJob.json().jobId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(oldJob.statusCode, 200);
    assert.equal(oldJob.json().status, "SUPERSEDED");

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    assert.equal(
      inventory.json().items.some((item: { sourceDistillJobId: string | null }) => item.sourceDistillJobId === firstJob.json().jobId),
      false,
    );
    assert.equal(
      inventory.json().items.some((item: { sourceDistillJobId: string | null }) => item.sourceDistillJobId === retryJob.json().jobId),
      true,
    );
  } finally {
    await apiApp.close();
    await resetSqlForTests();
  }
});

test("worker marks low quality generated profiles as needs sources with internal trace only", async () => {
  const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "";

  const [{ buildApiApp }, { buildWorkerApp }] = await Promise.all([
    import("./app.js"),
    import(new URL("../../worker/src/app.ts", import.meta.url).href),
  ]);
  const apiApp = buildApiApp();
  const workerApp = buildWorkerApp();
  const sql = getSql();

  try {
    const anonymous = await apiApp.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: { deviceId: "distill-v2-worker-needs-sources" },
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
        query: "虚拟角色补资料测试",
        usageIntent: "chat_companion",
        focus: ["说话方式"],
      },
    });
    assert.equal(intent.statusCode, 200);
    assert.equal(intent.json().entityType, "FICTIONAL_CHARACTER");

    const discovery = await createCompletedSourceDiscovery({
      apiApp,
      accessToken,
      intentId: intent.json().intentId,
      query: "虚拟角色补资料测试",
    });
    const candidateIds = discovery
      .sourceCandidates.filter((item: { recommended: boolean; riskFlags: string[] }) => item.recommended && item.riskFlags.length === 0)
      .slice(0, 2)
      .map((item: { sourceCandidateId: string }) => item.sourceCandidateId);
    assert.equal(candidateIds.length, 2);

    const job = await apiApp.inject({
      method: "POST",
      url: "/v1/persona-distill-jobs",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        intentId: intent.json().intentId,
        discoveryId: discovery.discoveryId,
        selectedSourceCandidateIds: candidateIds,
        selectedExtraSourceIds: [],
      },
    });
    assert.equal(job.statusCode, 200);
    assert.equal(job.json().status, "QUEUED");
    assert.equal("qualityScores" in job.json(), false);

    await runDueWithFreshFallback(workerApp);

    let completed: Awaited<ReturnType<ApiApp["inject"]>> | null = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      completed = await apiApp.inject({
        method: "GET",
        url: `/v1/persona-distill-jobs/${job.json().jobId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      assert.equal(completed.statusCode, 200);
      if (["NEEDS_MORE_SOURCES", "FAILED", "SUCCEEDED"].includes(completed.json().status)) {
        break;
      }
      await wait(1_000);
    }
    assert.ok(completed);
    assert.equal(completed.statusCode, 200);
    assert.equal(completed.json().status, "NEEDS_MORE_SOURCES");
    assert.equal("toolRuns" in completed.json(), false);
    assert.equal("runtimeState" in completed.json(), false);
    assert.equal("qualityScores" in completed.json(), false);

    const toolRuns = await sql<{ toolName: string; status: string }[]>`
      select tool_name as "toolName", status
      from persona_distill_tool_runs
      where job_id = ${job.json().jobId}::uuid
      order by seq asc
    `;
    assert.equal(toolRuns.some((item) => item.toolName === "mark_job_needs_sources" && item.status === "SUCCEEDED"), true);

    const inventory = await apiApp.inject({
      method: "GET",
      url: "/v1/me/persona-inventory",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(inventory.statusCode, 200);
    const item = inventory
      .json()
      .items.find((entry: { sourceDistillJobId: string | null }) => entry.sourceDistillJobId === job.json().jobId);
    assert.ok(item);
    assert.equal(item.status, "NEEDS_SOURCES");
    for (const key of ["toolRuns", "plannerModel", "modelProvider", "runtimeState", "coverageScore", "styleScore", "publishGate"]) {
      assert.equal(key in item, false);
    }
  } finally {
    await workerApp.close();
    await apiApp.close();
    await resetSqlForTests();
    if (originalDeepSeekApiKey !== undefined) {
      process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;
    } else {
      delete process.env.DEEPSEEK_API_KEY;
    }
  }
});
