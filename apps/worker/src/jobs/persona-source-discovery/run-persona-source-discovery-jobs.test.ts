import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { closeSql, getSql } from "../../db/client.js";
import { runDuePersonaSourceDiscoveryJobs } from "./run-persona-source-discovery-jobs.js";

const schemaFileUrl = new URL("../../../../api/src/db/schema.sql", import.meta.url);

const ensureSchemaForTests = async () => {
  await loadLocalEnv();
  const sql = getSql();
  const existing = await sql<{ exists: string | null }[]>`
    select to_regclass('public.persona_version_publish_reviews') as exists
  `;
  if (!existing[0]?.exists) {
    await sql.unsafe(await readFile(schemaFileUrl, "utf8"));
  }
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_source_discovery_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      intent_id UUID NOT NULL REFERENCES persona_distill_intents(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      preferred_language TEXT NOT NULL DEFAULT 'zh-CN',
      max_sources_per_bucket INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      current_step TEXT NOT NULL DEFAULT '准备搜索资料',
      progress INTEGER NOT NULL DEFAULT 0,
      discovery_id UUID REFERENCES persona_distill_discoveries(id) ON DELETE SET NULL,
      source_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      safe_error_message TEXT,
      retryable BOOLEAN NOT NULL DEFAULT false,
      next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_by_worker_id TEXT,
      claimed_at TIMESTAMPTZ,
      heartbeat_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_source_discovery_jobs_status_due_idx
      ON persona_distill_source_discovery_jobs (status, next_run_at ASC, created_at ASC);
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_source_discovery_jobs_creator_updated_idx
      ON persona_distill_source_discovery_jobs (created_by_user_id, updated_at DESC);
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_source_discovery_jobs_status_heartbeat_idx
      ON persona_distill_source_discovery_jobs (status, heartbeat_at ASC);
  `);
};

const insertSourceDiscoveryJob = async (input: {
  normalizedName?: string;
  riskDecision?: "ALLOW" | "NEED_REVIEW" | "BLOCK";
  status?: string;
  attemptCount?: number;
  heartbeatAt?: string;
  claimedByWorkerId?: string | null;
}) => {
  await ensureSchemaForTests();
  const sql = getSql();
  const userId = randomUUID();
  const intentId = randomUUID();
  const jobId = randomUUID();
  const normalizedName = input.normalizedName ?? "纪晓岚";
  const riskDecision = input.riskDecision ?? "ALLOW";
  const status = input.status ?? "QUEUED";
  const now = new Date().toISOString();

  await sql`
    insert into users (id, display_name, created_at, updated_at)
    values (${userId}::uuid, ${"测试用户"}, ${now}, ${now})
  `;
  await sql`
    insert into persona_distill_intents (
      id,
      created_by_user_id,
      query,
      normalized_name,
      entity_type,
      usage_intent,
      focus,
      risk_decision,
      risk_reasons,
      coverage_hint,
      next_step,
      created_at
    ) values (
      ${intentId}::uuid,
      ${userId}::uuid,
      ${normalizedName},
      ${normalizedName},
      ${"REAL_PERSON"},
      ${"chat_companion"},
      ${sql.json([])},
      ${riskDecision},
      ${sql.json([])},
      ${"ENOUGH"},
      ${riskDecision === "ALLOW" ? "DISCOVER_SOURCES" : "NEED_REVIEW"},
      ${now}
    )
  `;
  await sql`
    insert into persona_distill_source_discovery_jobs (
      id,
      intent_id,
      created_by_user_id,
      preferred_language,
      max_sources_per_bucket,
      status,
      current_step,
      progress,
      retryable,
      next_run_at,
      claimed_by_worker_id,
      heartbeat_at,
      attempt_count,
      created_at,
      updated_at
    ) values (
      ${jobId}::uuid,
      ${intentId}::uuid,
      ${userId}::uuid,
      ${"zh-CN"},
      ${4},
      ${status},
      ${"准备搜索资料"},
      ${status === "QUEUED" ? 5 : 35},
      ${false},
      now(),
      ${input.claimedByWorkerId ?? null},
      ${input.heartbeatAt ?? now},
      ${input.attemptCount ?? 0},
      ${now},
      ${now}
    )
  `;

  return { userId, intentId, jobId };
};

const webContext = {
  query: "纪晓岚 公开资料",
  freshnessStatus: "fresh" as const,
  keyFindings: ["找到公开资料。"],
  sources: [
    {
      title: "纪晓岚 官方访谈",
      url: "https://example.com/interview",
      publishedAt: null,
      snippet: "官方访谈原文，包含表达习惯。",
    },
    {
      title: "纪晓岚 生平时间线",
      url: "https://example.com/timeline",
      publishedAt: null,
      snippet: "生平经历和时间线。",
    },
    {
      title: "纪晓岚 作品与决定",
      url: "https://example.com/works",
      publishedAt: null,
      snippet: "代表作品和关键决定。",
    },
  ],
  uncertainty: null,
};

test("runDuePersonaSourceDiscoveryJobs persists discovery and candidates", async () => {
  const { jobId } = await insertSourceDiscoveryJob({});
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async () => webContext,
      createId: randomUUID,
    });

    assert.equal(result.claimed, 1);
    assert.equal(result.succeeded, 1);

    const jobs = await sql<Array<{ status: string; discoveryId: string | null; sourceCount: number }>>`
      select status, discovery_id as "discoveryId", source_count as "sourceCount"
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "SUCCEEDED");
    assert.ok(jobs[0]?.discoveryId);
    assert.equal(jobs[0]?.sourceCount, 3);

    const candidates = await sql<Array<{ id: string }>>`
      select id
      from persona_distill_source_candidates
      where discovery_id = ${jobs[0]?.discoveryId}::uuid
    `;
    assert.equal(candidates.length, 3);
  } finally {
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs retries overloaded source search", async () => {
  const { jobId } = await insertSourceDiscoveryJob({ attemptCount: 0 });
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async () => {
        throw new Error("The engine is currently overloaded, please try again later");
      },
    });

    assert.equal(result.claimed, 1);
    assert.equal(result.retried, 1);
    const jobs = await sql<
      Array<{
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
        safeErrorMessage: string | null;
        retryable: boolean;
      }>
    >`
      select
        status,
        error_code as "errorCode",
        error_message as "errorMessage",
        safe_error_message as "safeErrorMessage",
        retryable
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "QUEUED");
    assert.equal(jobs[0]?.errorCode, "KIMI_OVERLOADED");
    assert.equal(jobs[0]?.safeErrorMessage, "搜索服务繁忙，可以稍后重试");
    assert.equal(jobs[0]?.retryable, true);
    assert.match(jobs[0]?.errorMessage ?? "", /engine is currently overloaded/u);
  } finally {
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs fails after max retry attempts", async () => {
  const previousMaxAttempts = process.env.PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS;
  process.env.PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS = "3";
  const { jobId } = await insertSourceDiscoveryJob({ attemptCount: 2 });
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async () => {
        throw new Error("The engine is currently overloaded, please try again later");
      },
    });

    assert.equal(result.claimed, 1);
    assert.equal(result.failed, 1);
    const jobs = await sql<Array<{ status: string; retryable: boolean }>>`
      select status, retryable
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "FAILED");
    assert.equal(jobs[0]?.retryable, true);
  } finally {
    if (previousMaxAttempts === undefined) {
      delete process.env.PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS;
    } else {
      process.env.PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS = previousMaxAttempts;
    }
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs reclaims stale jobs without claiming when batch is zero", async () => {
  const staleHeartbeat = new Date(Date.now() - 240_000).toISOString();
  const { jobId } = await insertSourceDiscoveryJob({
    status: "SEARCHING",
    heartbeatAt: staleHeartbeat,
    claimedByWorkerId: "dead-worker",
  });
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({ batchSize: 0, onlyJobIds: [jobId] });

    assert.equal(result.reclaimed, 1);
    assert.equal(result.claimed, 0);
    const jobs = await sql<Array<{ status: string }>>`
      select status
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "QUEUED");
  } finally {
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs blocks risky intents without calling researcher", async () => {
  const { jobId } = await insertSourceDiscoveryJob({ riskDecision: "NEED_REVIEW" });
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async () => {
        throw new Error("researcher should not be called");
      },
    });

    assert.equal(result.blocked, 1);
    const jobs = await sql<Array<{ status: string; retryable: boolean; errorCode: string | null }>>`
      select status, retryable, error_code as "errorCode"
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "BLOCKED");
    assert.equal(jobs[0]?.retryable, false);
    assert.equal(jobs[0]?.errorCode, "RISK_BLOCKED");
  } finally {
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs does not persist after losing lease", async () => {
  const previousWorkerId = process.env.WORKER_ID;
  process.env.WORKER_ID = "worker-1";
  const { jobId } = await insertSourceDiscoveryJob({});
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async () => {
        await sql`
          update persona_distill_source_discovery_jobs
             set claimed_by_worker_id = 'worker-2',
                 attempt_count = attempt_count + 1,
                 updated_at = now()
           where id = ${jobId}::uuid
        `;
        return webContext;
      },
    });

    assert.equal(result.lostLease, 1);
    assert.equal(result.succeeded, 0);
    const jobs = await sql<Array<{ status: string; discoveryId: string | null }>>`
      select status, discovery_id as "discoveryId"
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.notEqual(jobs[0]?.status, "SUCCEEDED");
    assert.equal(jobs[0]?.discoveryId, null);
    const discoveries = await sql<Array<{ id: string }>>`
      select id
      from persona_distill_discoveries
      where intent_id = (
        select intent_id
        from persona_distill_source_discovery_jobs
        where id = ${jobId}::uuid
      )
    `;
    assert.equal(discoveries.length, 0);
  } finally {
    if (previousWorkerId === undefined) {
      delete process.env.WORKER_ID;
    } else {
      process.env.WORKER_ID = previousWorkerId;
    }
    await closeSql();
  }
});

test("runDuePersonaSourceDiscoveryJobs aborts long Kimi calls before stale reclaim threshold", async () => {
  const previousTimeout = process.env.PERSONA_SOURCE_DISCOVERY_KIMI_TIMEOUT_MS;
  process.env.PERSONA_SOURCE_DISCOVERY_KIMI_TIMEOUT_MS = "20";
  const { jobId } = await insertSourceDiscoveryJob({});
  const sql = getSql();

  try {
    const result = await runDuePersonaSourceDiscoveryJobs({
      onlyJobIds: [jobId],
      researcher: async (_input, deps) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve(webContext), 5_000);
          timeout.unref();
          deps?.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });

    assert.equal(result.retried, 1);
    const jobs = await sql<Array<{ status: string; errorCode: string | null; safeErrorMessage: string | null }>>`
      select status, error_code as "errorCode", safe_error_message as "safeErrorMessage"
      from persona_distill_source_discovery_jobs
      where id = ${jobId}::uuid
    `;
    assert.equal(jobs[0]?.status, "QUEUED");
    assert.equal(jobs[0]?.errorCode, "SOURCE_SEARCH_TIMEOUT");
    assert.equal(jobs[0]?.safeErrorMessage, "搜索超时，可以稍后重试");
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.PERSONA_SOURCE_DISCOVERY_KIMI_TIMEOUT_MS;
    } else {
      process.env.PERSONA_SOURCE_DISCOVERY_KIMI_TIMEOUT_MS = previousTimeout;
    }
    await closeSql();
  }
});
