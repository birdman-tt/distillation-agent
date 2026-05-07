import { createHash, randomUUID } from "node:crypto";
import type { JSONValue } from "postgres";

import {
  buildDiscoveryQualityWarnings,
  buildSourceCandidatesFromWebContext,
  createBucketCoverage,
  evidenceBuckets,
  type DistillSourceCandidateDraft,
  type EvidenceBucket,
} from "@hall-of-fame/domain";
import { runKimiResearcher, type WebContext } from "@hall-of-fame/kimi-client";

import { getSql, withTransaction } from "../../db/client.js";

type SourceDiscoveryStatus = "QUEUED" | "CLAIMED" | "SEARCHING" | "PERSISTING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
type EntityType = "REAL_PERSON" | "FICTIONAL_CHARACTER" | "UNKNOWN";
type RiskDecision = "ALLOW" | "NEED_REVIEW" | "BLOCK";

type SourceDiscoveryJob = {
  id: string;
  intentId: string;
  createdByUserId: string;
  preferredLanguage: string;
  maxSourcesPerBucket: number;
  status: SourceDiscoveryStatus;
  currentStep: string;
  progress: number;
  discoveryId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  safeErrorMessage: string | null;
  retryable: boolean;
  claimedByWorkerId: string | null;
  heartbeatAt: Date | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
  query: string;
  normalizedName: string;
  entityType: EntityType;
  riskDecision: RiskDecision;
};

type LeasedSourceDiscoveryJob = SourceDiscoveryJob & {
  claimedByWorkerId: string;
};

type KimiResearcher = typeof runKimiResearcher;

const staleThresholdMs = 180_000;
const defaultKimiTimeoutMs = 120_000;
const sourceDiscoveryActiveStatuses = ["CLAIMED", "SEARCHING", "PERSISTING"] as const;

const selectSourceDiscoveryJobColumns = `
  j.id,
  j.intent_id as "intentId",
  j.created_by_user_id as "createdByUserId",
  j.preferred_language as "preferredLanguage",
  j.max_sources_per_bucket as "maxSourcesPerBucket",
  j.status,
  j.current_step as "currentStep",
  j.progress,
  j.discovery_id as "discoveryId",
  j.error_code as "errorCode",
  j.error_message as "errorMessage",
  j.safe_error_message as "safeErrorMessage",
  j.retryable,
  j.claimed_by_worker_id as "claimedByWorkerId",
  j.heartbeat_at as "heartbeatAt",
  j.attempt_count as "attemptCount",
  j.created_at as "createdAt",
  j.updated_at as "updatedAt",
  i.query,
  i.normalized_name as "normalizedName",
  i.entity_type as "entityType",
  i.risk_decision as "riskDecision"
`;

const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");

const readMaxAttempts = () => {
  const parsed = Number(process.env.PERSONA_SOURCE_DISCOVERY_MAX_ATTEMPTS ?? "3");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
};

const readKimiTimeoutMs = () => {
  const parsed = Number(process.env.PERSONA_SOURCE_DISCOVERY_KIMI_TIMEOUT_MS ?? String(defaultKimiTimeoutMs));
  const requested = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultKimiTimeoutMs;
  return Math.min(requested, staleThresholdMs - 10_000);
};

const readWorkerId = () => process.env.WORKER_ID ?? `local-source-discovery-${process.pid}`;

const backoffMsForAttempt = (attemptCount: number) => (attemptCount <= 1 ? 15_000 : 45_000);

const addMilliseconds = (value: Date, milliseconds: number) => new Date(value.getTime() + milliseconds).toISOString();

const isAbortError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || /abort|timeout|timed out/u.test(error.message));

const classifySourceDiscoveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  if (isAbortError(error)) {
    return {
      errorCode: "SOURCE_SEARCH_TIMEOUT",
      safeErrorMessage: "搜索超时，可以稍后重试",
      errorMessage: message,
    };
  }
  if (/overloaded|429|too many requests|rate limit|engine is currently overloaded/iu.test(message)) {
    return {
      errorCode: "KIMI_OVERLOADED",
      safeErrorMessage: "搜索服务繁忙，可以稍后重试",
      errorMessage: message,
    };
  }
  return {
    errorCode: "SOURCE_SEARCH_FAILED",
    safeErrorMessage: "资料搜索失败，可以稍后重试",
    errorMessage: message,
  };
};

const withAbortTimeout = async <T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const reclaimStaleJobs = async (maxAttempts: number, onlyJobIds?: string[]) =>
  withTransaction(async (sql) => {
    const jobFilter = onlyJobIds?.length ? sql`and j.id = any(${onlyJobIds}::uuid[])` : sql``;
    const staleJobs = await sql<SourceDiscoveryJob[]>`
      select ${sql.unsafe(selectSourceDiscoveryJobColumns)}
      from persona_distill_source_discovery_jobs j
      join persona_distill_intents i on i.id = j.intent_id
      where j.status in ('CLAIMED', 'SEARCHING', 'PERSISTING')
        and (j.heartbeat_at is null or j.heartbeat_at < now() - interval '180 seconds')
        ${jobFilter}
      order by j.heartbeat_at asc nulls first, j.created_at asc
      for update skip locked
    `;

    let reclaimed = 0;
    let failed = 0;
    for (const job of staleJobs) {
      if (job.attemptCount < maxAttempts) {
        const rows = await sql<{ id: string }[]>`
          update persona_distill_source_discovery_jobs
             set status = 'QUEUED',
                 current_step = '重新排队搜索资料',
                 progress = 5,
                 retryable = true,
                 next_run_at = now(),
                 claimed_by_worker_id = null,
                 claimed_at = null,
                 heartbeat_at = now(),
                 updated_at = now()
           where id = ${job.id}::uuid
           returning id
        `;
        reclaimed += rows.length;
      } else {
        const rows = await sql<{ id: string }[]>`
          update persona_distill_source_discovery_jobs
             set status = 'FAILED',
                 current_step = '资料搜索超时',
                 progress = 100,
                 error_code = 'SOURCE_SEARCH_TIMEOUT',
                 error_message = 'source discovery job stale timeout',
                 safe_error_message = '搜索任务超时，可以稍后重试',
                 retryable = true,
                 claimed_by_worker_id = null,
                 claimed_at = null,
                 heartbeat_at = now(),
                 updated_at = now()
           where id = ${job.id}::uuid
           returning id
        `;
        failed += rows.length;
      }
    }

    return { reclaimed, failed };
  });

const claimJobs = async (batchSize: number, workerId: string, onlyJobIds?: string[]): Promise<LeasedSourceDiscoveryJob[]> =>
  withTransaction(async (sql) => {
    const jobFilter = onlyJobIds?.length ? sql`and j.id = any(${onlyJobIds}::uuid[])` : sql``;
    const jobs = await sql<SourceDiscoveryJob[]>`
      select ${sql.unsafe(selectSourceDiscoveryJobColumns)}
      from persona_distill_source_discovery_jobs j
      join persona_distill_intents i on i.id = j.intent_id
      where j.status = 'QUEUED'
        and j.next_run_at <= now()
        ${jobFilter}
      order by j.next_run_at asc, j.created_at asc
      limit ${batchSize}
      for update skip locked
    `;

    const claimed: LeasedSourceDiscoveryJob[] = [];
    for (const job of jobs) {
      const nextAttemptCount = job.attemptCount + 1;
      const rows = await sql<{ id: string }[]>`
        update persona_distill_source_discovery_jobs
           set status = 'CLAIMED',
               current_step = '准备搜索资料',
               progress = 10,
               claimed_by_worker_id = ${workerId},
               claimed_at = now(),
               heartbeat_at = now(),
               attempt_count = ${nextAttemptCount},
               updated_at = now()
         where id = ${job.id}::uuid
           and status = 'QUEUED'
         returning id
      `;
      if (rows[0]) {
        claimed.push({
          ...job,
          status: "CLAIMED",
          currentStep: "准备搜索资料",
          progress: 10,
          claimedByWorkerId: workerId,
          attemptCount: nextAttemptCount,
        });
      }
    }

    return claimed;
  });

const updateLeasedJob = async (
  job: LeasedSourceDiscoveryJob,
  input: {
    status: SourceDiscoveryStatus;
    currentStep: string;
    progress: number;
    allowedStatuses: SourceDiscoveryStatus[];
  },
) => {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    update persona_distill_source_discovery_jobs
       set status = ${input.status},
           current_step = ${input.currentStep},
           progress = ${input.progress},
           heartbeat_at = now(),
           updated_at = now()
     where id = ${job.id}::uuid
       and claimed_by_worker_id = ${job.claimedByWorkerId}
       and attempt_count = ${job.attemptCount}
       and status = any(${input.allowedStatuses}::text[])
     returning id
  `;
  return rows.length > 0;
};

const markLeasedFailure = async (
  job: LeasedSourceDiscoveryJob,
  input: {
    errorCode: string;
    errorMessage: string;
    safeErrorMessage: string;
  },
  maxAttempts: number,
) => {
  const sql = getSql();
  const shouldRetry = job.attemptCount < maxAttempts;
  const nextRunAt = addMilliseconds(new Date(), backoffMsForAttempt(job.attemptCount));
  const rows = await sql<{ id: string }[]>`
    update persona_distill_source_discovery_jobs
       set status = ${shouldRetry ? "QUEUED" : "FAILED"},
           current_step = ${shouldRetry ? "等待重新搜索资料" : "资料搜索失败"},
           progress = ${shouldRetry ? 5 : 100},
           error_code = ${input.errorCode},
           error_message = ${input.errorMessage},
           safe_error_message = ${input.safeErrorMessage},
           retryable = true,
           next_run_at = ${shouldRetry ? nextRunAt : new Date().toISOString()},
           claimed_by_worker_id = null,
           claimed_at = null,
           heartbeat_at = now(),
           updated_at = now()
     where id = ${job.id}::uuid
       and claimed_by_worker_id = ${job.claimedByWorkerId}
       and attempt_count = ${job.attemptCount}
       and status in ('CLAIMED', 'SEARCHING', 'PERSISTING')
     returning id
  `;
  if (rows.length === 0) {
    return "lost_lease" as const;
  }
  return shouldRetry ? ("retried" as const) : ("failed" as const);
};

const markLeasedBlocked = async (job: LeasedSourceDiscoveryJob) => {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    update persona_distill_source_discovery_jobs
       set status = 'BLOCKED',
           current_step = '当前对象暂不能蒸馏',
           progress = 100,
           error_code = 'RISK_BLOCKED',
           error_message = 'intent risk decision is not ALLOW',
           safe_error_message = '当前对象暂不能创建，请换一个对象。',
           retryable = false,
           claimed_by_worker_id = null,
           claimed_at = null,
           heartbeat_at = now(),
           updated_at = now()
     where id = ${job.id}::uuid
       and claimed_by_worker_id = ${job.claimedByWorkerId}
       and attempt_count = ${job.attemptCount}
       and status in ('CLAIMED', 'SEARCHING', 'PERSISTING')
     returning id
  `;
  return rows.length > 0 ? ("blocked" as const) : ("lost_lease" as const);
};

const buildResearchInput = (job: LeasedSourceDiscoveryJob) => {
  const now = new Date();
  return {
    userMessage: `为一键蒸馏对象“${job.normalizedName}”查找可追溯资料来源`,
    researchPlan: {
      subject: job.normalizedName,
      subjectType: "persona" as const,
      normalizedQuestion: `查找 ${job.normalizedName} 的公开资料、访谈、作品或可靠介绍，用于人物对话蒸馏`,
      searchQueries: [
        `${job.normalizedName} 公开资料 访谈 作品`,
        `${job.normalizedName} 生平 观点 代表表达`,
        `${job.normalizedName} 人物 风格 资料`,
      ],
      freshnessRequirement: "latest_available" as const,
      timeWindow: "latest_available" as const,
      evidenceRequirement: {
        minSources: 3,
        requireUrl: true,
      },
      ifNoReliableSource: "say_not_found_do_not_guess" as const,
      asOf: now.toISOString(),
      timezone: "Asia/Shanghai",
      currentYear: now.getFullYear(),
    },
    plannerReason: "one-click persona distill source discovery",
    locale: "zh-CN" as const,
    maxFindings: Math.max(3, Math.min(12, job.maxSourcesPerBucket * evidenceBuckets.length)),
  };
};

const persistDiscovery = async (job: LeasedSourceDiscoveryJob, candidates: DistillSourceCandidateDraft[]) =>
  withTransaction(async (sql) => {
    const lockedRows = await sql<Pick<SourceDiscoveryJob, "id" | "status" | "claimedByWorkerId" | "attemptCount">[]>`
      select
        id,
        status,
        claimed_by_worker_id as "claimedByWorkerId",
        attempt_count as "attemptCount"
      from persona_distill_source_discovery_jobs
      where id = ${job.id}::uuid
      for update
    `;
    const locked = lockedRows[0];
    if (
      !locked ||
      locked.status !== "PERSISTING" ||
      locked.claimedByWorkerId !== job.claimedByWorkerId ||
      locked.attemptCount !== job.attemptCount
    ) {
      return "lost_lease" as const;
    }

    const bucketCoverage = createBucketCoverage(candidates);
    const missingBuckets = evidenceBuckets.filter((bucket) => bucketCoverage[bucket] === 0);
    const qualityWarnings = buildDiscoveryQualityWarnings({ missingBuckets });
    const discoveryId = randomUUID();
    await sql`
      insert into persona_distill_discoveries (
        id,
        intent_id,
        created_by_user_id,
        bucket_coverage,
        missing_buckets,
        quality_warnings,
        sanitizer_version
      ) values (
        ${discoveryId}::uuid,
        ${job.intentId}::uuid,
        ${job.createdByUserId}::uuid,
        ${sql.json(bucketCoverage as Record<EvidenceBucket, number> as JSONValue)},
        ${sql.json(missingBuckets as JSONValue)},
        ${sql.json(qualityWarnings as JSONValue)},
        ${"web-search-v1"}
      )
    `;

    for (const candidate of candidates) {
      await sql`
        insert into persona_distill_source_candidates (
          id,
          discovery_id,
          bucket,
          title,
          url,
          normalized_url_hash,
          publisher,
          author,
          published_at,
          snippet,
          source_kind,
          trust_level,
          source_category,
          is_primary,
          recommended,
          recommendation_reason,
          dedupe_key,
          risk_flags
        ) values (
          ${candidate.sourceCandidateId}::uuid,
          ${discoveryId}::uuid,
          ${candidate.bucket},
          ${candidate.title},
          ${candidate.url},
          ${candidate.normalizedUrlHash},
          ${candidate.publisher},
          ${candidate.author},
          ${candidate.publishedAt},
          ${candidate.snippet},
          ${candidate.sourceKind},
          ${candidate.trustLevel},
          ${candidate.sourceCategory},
          ${candidate.isPrimary},
          ${candidate.recommended},
          ${candidate.recommendationReason},
          ${candidate.dedupeKey},
          ${sql.json(candidate.riskFlags as JSONValue)}
        )
      `;
    }

    const updated = await sql<{ id: string }[]>`
      update persona_distill_source_discovery_jobs
         set status = 'SUCCEEDED',
             current_step = '资料已找到',
             progress = 100,
             discovery_id = ${discoveryId}::uuid,
             source_count = ${candidates.length},
             error_code = null,
             error_message = null,
             safe_error_message = null,
             retryable = false,
             claimed_by_worker_id = null,
             claimed_at = null,
             heartbeat_at = now(),
             updated_at = now()
       where id = ${job.id}::uuid
         and claimed_by_worker_id = ${job.claimedByWorkerId}
         and attempt_count = ${job.attemptCount}
         and status = 'PERSISTING'
       returning id
    `;
    return updated.length > 0 ? ("succeeded" as const) : ("lost_lease" as const);
  });

const runOneJob = async (
  job: LeasedSourceDiscoveryJob,
  deps: {
    researcher: KimiResearcher;
    createId: () => string;
    maxAttempts: number;
    kimiTimeoutMs: number;
  },
) => {
  if (job.riskDecision !== "ALLOW") {
    return markLeasedBlocked(job);
  }

  const searchUpdated = await updateLeasedJob(job, {
    status: "SEARCHING",
    currentStep: "搜索公开资料",
    progress: 35,
    allowedStatuses: ["CLAIMED"],
  });
  if (!searchUpdated) {
    return "lost_lease" as const;
  }

  let webContext: WebContext;
  try {
    webContext = await withAbortTimeout(deps.kimiTimeoutMs, (signal) => deps.researcher(buildResearchInput(job), { signal }));
  } catch (error) {
    return markLeasedFailure(job, classifySourceDiscoveryError(error), deps.maxAttempts);
  }

  const candidates = buildSourceCandidatesFromWebContext({
    normalizedName: job.normalizedName,
    sources: webContext.sources,
    createSourceCandidateId: deps.createId,
    hashValue,
    maxCandidates: Math.max(3, Math.min(12, job.maxSourcesPerBucket * evidenceBuckets.length)),
  });
  if (candidates.length === 0) {
    return markLeasedFailure(
      job,
      {
        errorCode: "NO_SOURCE_FOUND",
        errorMessage: "Kimi returned no usable source candidates",
        safeErrorMessage: "暂时没有找到可用资料，可以重试或手动补充资料",
      },
      deps.maxAttempts,
    );
  }

  const persistUpdated = await updateLeasedJob(job, {
    status: "PERSISTING",
    currentStep: "保存资料来源",
    progress: 75,
    allowedStatuses: ["SEARCHING"],
  });
  if (!persistUpdated) {
    return "lost_lease" as const;
  }

  return persistDiscovery(job, candidates);
};

export const runDuePersonaSourceDiscoveryJobs = async (
  input: {
    batchSize?: number;
    researcher?: KimiResearcher;
    createId?: () => string;
    onlyJobIds?: string[];
  } = {},
) => {
  const maxAttempts = readMaxAttempts();
  const reclaimResult = await reclaimStaleJobs(maxAttempts, input.onlyJobIds);
  const jobs = input.batchSize === 0 ? [] : await claimJobs(input.batchSize ?? 3, readWorkerId(), input.onlyJobIds);
  let succeeded = 0;
  let failed = reclaimResult.failed;
  let retried = reclaimResult.reclaimed;
  let blocked = 0;
  let lostLease = 0;

  for (const job of jobs) {
    const result = await runOneJob(job, {
      researcher: input.researcher ?? runKimiResearcher,
      createId: input.createId ?? randomUUID,
      maxAttempts,
      kimiTimeoutMs: readKimiTimeoutMs(),
    });
    if (result === "succeeded") {
      succeeded += 1;
    } else if (result === "retried") {
      retried += 1;
    } else if (result === "blocked") {
      blocked += 1;
    } else if (result === "lost_lease") {
      lostLease += 1;
    } else {
      failed += 1;
    }
  }

  return {
    claimed: jobs.length,
    succeeded,
    failed,
    retried,
    blocked,
    reclaimed: reclaimResult.reclaimed,
    lostLease,
  };
};

export const __internal = {
  readKimiTimeoutMs,
  staleThresholdMs,
};
