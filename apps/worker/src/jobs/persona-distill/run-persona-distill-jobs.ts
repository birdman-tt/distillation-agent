import { createHash, randomUUID } from "node:crypto";
import type { JSONValue } from "postgres";

import {
  distillToolCallSchema,
  distillToolResultSchema,
  type DistillToolCall,
  type DistillToolName,
  type DistillToolResult,
} from "@hall-of-fame/contracts";

import { getSql, withTransaction } from "../../db/client.js";
import { runDistillJob } from "../distill/run-distill-job.js";
import {
  buildDistillPlannerFromEnv,
  type DistillPlannerJobContext,
  type DistillToolMemorySnapshot,
} from "./tool-runtime/distill-planner.js";
import { runDistillToolLoop } from "./tool-runtime/tool-loop.js";
import type { DistillToolHandler } from "./tool-runtime/tool-registry.js";
import { logDistillEvent, type DistillLogger } from "./distill-logger.js";

type JobRow = {
  id: string;
  createdByUserId: string;
  intentId: string;
  discoveryId: string;
  personaId: string;
  query: string;
  normalizedName: string;
  entityType: "REAL_PERSON" | "FICTIONAL_CHARACTER" | "UNKNOWN";
  riskDecision: "ALLOW" | "NEED_REVIEW" | "BLOCK";
  riskReasons: unknown;
  selectedSourceCandidateIds: unknown;
  selectedExtraSourceIds: unknown;
  attemptCount: number;
};

type CandidateRow = {
  id: string;
  bucket: "WRITINGS" | "CONVERSATIONS" | "EXPRESSION_DNA" | "EXTERNAL_VIEWS" | "DECISIONS" | "TIMELINE";
  title: string;
  url: string | null;
  publisher: string | null;
  author: string | null;
  snippet: string;
  sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  trustLevel: "HIGH" | "MEDIUM" | "LOW";
  riskFlags: unknown;
  extraSourceId: string | null;
};

type ApprovedSourceSnapshot = Awaited<ReturnType<typeof createApprovedSourceSnapshot>>;
type DistillJobOutput = Awaited<ReturnType<typeof runDistillJob>>;

type DistillToolMemory = {
  candidates: CandidateRow[];
  usableCandidates: CandidateRow[];
  approvedSources: ApprovedSourceSnapshot[];
  coverageMissingRequirements: string[];
  validationMissingRequirements: string[];
  output: DistillJobOutput | null;
  persistedVersionId: string | null;
};

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const sortedStrings = (value: string[]) => [...value].sort();
const assertSameStringSet = (actual: string[], expected: string[], label: string) => {
  assertJsonEqual(sortedStrings(actual), sortedStrings(expected), label);
};
const assertJsonEqual = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match job context`);
  }
};
const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");
const trustScore = (level: CandidateRow["trustLevel"], kind: CandidateRow["sourceKind"]) => {
  if (level === "HIGH") {
    return kind === "PRIMARY" ? 90 : 82;
  }
  if (level === "MEDIUM") {
    return kind === "PRIMARY" ? 78 : 70;
  }
  return 55;
};

const upsertOwnedObjectForJob = async (
  sql: any,
  input: {
    job: JobRow;
    status: "CREATING" | "NEEDS_SOURCES" | "PENDING_CONFIRM" | "FAILED";
    activePersonaVersionId?: string | null;
    intro?: string | null;
    updatedAt?: string;
  },
) => {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const updated = await sql<{ id: string }[]>`
    update owned_persona_objects
       set source_distill_job_id = ${input.job.id}::uuid,
           active_persona_version_id = coalesce(${input.activePersonaVersionId ?? null}::uuid, active_persona_version_id),
           intro = coalesce(${input.intro ?? null}, intro),
           status = ${input.status},
           updated_at = ${updatedAt}
     where deleted_at is null
       and (
         source_distill_job_id = ${input.job.id}::uuid
         or (
           owner_user_id = ${input.job.createdByUserId}::uuid
           and persona_id = ${input.job.personaId}::uuid
         )
       )
     returning id
  `;
  if (updated[0]) {
    return;
  }

  await sql`
    insert into owned_persona_objects (
      id,
      owner_user_id,
      persona_id,
      active_persona_version_id,
      source_distill_job_id,
      display_name,
      intro,
      status,
      created_at,
      updated_at
    ) values (
      ${randomUUID()}::uuid,
      ${input.job.createdByUserId}::uuid,
      ${input.job.personaId}::uuid,
      ${input.activePersonaVersionId ?? null}::uuid,
      ${input.job.id}::uuid,
      ${input.job.normalizedName},
      ${input.intro ?? null},
      ${input.status},
      ${updatedAt},
      ${updatedAt}
    )
  `;
};

const getPreviewGateMissingReasons = (input: Awaited<ReturnType<typeof runDistillJob>>, candidates: CandidateRow[]) => {
  const reasons: string[] = [];
  const usableCandidates = candidates.filter((candidate) => asStringArray(candidate.riskFlags).length === 0);
  const bucketCount = new Set(usableCandidates.map((candidate) => candidate.bucket)).size;
  const primaryOrSecondaryCount = usableCandidates.filter(
    (candidate) => candidate.sourceKind === "PRIMARY" || candidate.sourceKind === "SECONDARY",
  ).length;

  if (usableCandidates.length < 3) {
    reasons.push("至少需要 3 条可用资料");
  }
  if (bucketCount < 2) {
    reasons.push("至少需要覆盖 2 类证据桶");
  }
  if (primaryOrSecondaryCount < 1) {
    reasons.push("至少需要 1 条 PRIMARY 或 SECONDARY 资料");
  }
  if (input.scores.coverageScore < 60) {
    reasons.push("资料覆盖不足");
  }
  if (input.scores.groundingScore < 70) {
    reasons.push("证据支撑不足");
  }
  if (input.scores.styleScore < 60) {
    reasons.push("人物风格不稳定");
  }
  if (input.scores.riskScore > 40) {
    reasons.push("风险评分过高");
  }
  return reasons;
};

const updateJobProgress = async (
  jobId: string,
  status: string,
  currentStep: string,
  progress: number,
  logger?: DistillLogger,
) => {
  const sql = getSql();
  await sql`
    update persona_distill_jobs
       set status = ${status},
           current_step = ${currentStep},
           progress = ${progress},
           heartbeat_at = now(),
           updated_at = now()
     where id = ${jobId}::uuid
  `;
  logDistillEvent(logger, "info", "persona_distill.job.progress_updated", {
    jobId,
    status,
    currentStep,
    progress,
  });
};

const claimJobs = async (batchSize: number) =>
  withTransaction(async (sql) => {
    const jobs = await sql<JobRow[]>`
      select
        j.id,
        j.created_by_user_id as "createdByUserId",
        j.intent_id as "intentId",
        j.discovery_id as "discoveryId",
        j.persona_id as "personaId",
        j.query,
        j.normalized_name as "normalizedName",
        j.entity_type as "entityType",
        j.risk_decision as "riskDecision",
        i.risk_reasons as "riskReasons",
        j.selected_source_candidate_ids as "selectedSourceCandidateIds",
        j.selected_extra_source_ids as "selectedExtraSourceIds",
        j.attempt_count as "attemptCount"
      from persona_distill_jobs j
      join persona_distill_intents i on i.id = j.intent_id
      where j.status = 'QUEUED'
      order by j.created_at asc
      limit ${batchSize}
      for update skip locked
    `;

    for (const job of jobs) {
      await sql`
        update persona_distill_jobs
           set status = 'CLAIMED',
               current_step = '准备资料',
               progress = 5,
               claimed_by_worker_id = ${process.env.WORKER_ID ?? "local-worker"},
               claimed_at = now(),
               heartbeat_at = now(),
               attempt_count = ${job.attemptCount + 1},
               updated_at = now()
         where id = ${job.id}::uuid
      `;
    }

    return jobs;
  });

const loadSelectedCandidates = async (job: JobRow) => {
  const selectedCandidateIds = asStringArray(job.selectedSourceCandidateIds);
  const selectedExtraSourceIds = asStringArray(job.selectedExtraSourceIds);
  if (selectedCandidateIds.length === 0 && selectedExtraSourceIds.length === 0) {
    return [];
  }

  const sql = getSql();
  const candidates = await sql<CandidateRow[]>`
      select
        id,
        bucket,
        title,
        url,
        publisher,
        author,
        snippet,
        source_kind as "sourceKind",
        trust_level as "trustLevel",
        risk_flags as "riskFlags",
        extra_source_id as "extraSourceId"
    from persona_distill_source_candidates
    where discovery_id = ${job.discoveryId}::uuid
      and (
        id = any(${selectedCandidateIds}::uuid[])
        or extra_source_id = any(${selectedExtraSourceIds}::uuid[])
      )
    order by recommended desc, created_at asc
  `;

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
};

const createApprovedSourceSnapshot = async (sql: any, job: JobRow, candidate: CandidateRow, createdAt: string) => {
  const sourceId = randomUUID();
  const documentId = randomUUID();
  const spanId = randomUUID();
  const normalizedText = `${candidate.title}\n\n${candidate.snippet}`.trim();
  const quote = normalizedText.slice(0, 240);
  const normalizedUrlHash = candidate.url ? hashValue(candidate.url) : null;

  await sql`
    insert into persona_sources (
      id,
      persona_id,
      input_type,
      review_status,
      source_url,
      source_title,
      source_author,
      source_summary,
      source_kind,
      source_published_at,
      submitted_by_user_id,
      normalized_url,
      normalized_url_hash,
      trust_score,
      review_reason,
      reviewed_by_user_id,
      reviewed_at,
      created_at
    ) values (
      ${sourceId}::uuid,
      ${job.personaId}::uuid,
      ${candidate.url ? "URL" : "TEXT"},
      ${"APPROVED"},
      ${candidate.url},
      ${candidate.title},
      ${candidate.author ?? candidate.publisher},
      ${candidate.snippet.slice(0, 160)},
      ${candidate.sourceKind},
      null,
      ${job.createdByUserId}::uuid,
      ${candidate.url},
      ${normalizedUrlHash},
      ${trustScore(candidate.trustLevel, candidate.sourceKind)},
      null,
      null,
      ${createdAt},
      ${createdAt}
    )
  `;

  await sql`
    insert into source_documents (
      id,
      source_id,
      title,
      author,
      url,
      normalized_text,
      content_hash,
      fetch_status_code,
      fetch_error,
      fetched_at,
      created_at
    ) values (
      ${documentId}::uuid,
      ${sourceId}::uuid,
      ${candidate.title},
      ${candidate.author ?? candidate.publisher},
      ${candidate.url},
      ${normalizedText},
      ${hashValue(normalizedText)},
      ${candidate.url ? 202 : null},
      null,
      ${createdAt},
      ${createdAt}
    )
  `;

  await sql`
    insert into evidence_spans (
      id,
      document_id,
      section_label,
      span_start,
      span_end,
      normalized_quote,
      source_kind,
      trust_score,
      dedupe_group_id,
      conflict_group_id,
      created_at
    ) values (
      ${spanId}::uuid,
      ${documentId}::uuid,
      ${"body"},
      0,
      ${quote.length},
      ${quote},
      ${candidate.sourceKind},
      ${trustScore(candidate.trustLevel, candidate.sourceKind)},
      null,
      null,
      ${createdAt}
    )
  `;

  return {
    sourceId,
    documentId,
    sourceKind: candidate.sourceKind,
    title: candidate.title,
    summary: candidate.snippet,
  };
};

const persistCandidateVersion = async (
  job: JobRow,
  approvedSources: Array<{ sourceId: string; documentId: string }>,
  output: Awaited<ReturnType<typeof runDistillJob>>,
  logger?: DistillLogger,
) =>
  withTransaction(async (sql) => {
    const latestRows = await sql<{ latestVersionNumber: number | null }[]>`
      select max(version_number)::int as "latestVersionNumber"
      from persona_versions
      where persona_id = ${job.personaId}::uuid
    `;
    const versionId = randomUUID();
    const createdAt = new Date().toISOString();

    await sql`
      insert into persona_versions (
        id,
        persona_id,
        version_number,
        status,
        profile_json,
        distill_focus,
        preview_intro,
        recommended_questions,
        sample_answers,
        coverage_score,
        grounding_score,
        style_score,
        risk_score,
        source_distill_job_id,
        created_by_user_id,
        submitted_for_publish_at,
        published_at,
        superseded_at,
        created_at
      ) values (
        ${versionId}::uuid,
        ${job.personaId}::uuid,
        ${(latestRows[0]?.latestVersionNumber ?? 0) + 1},
        ${"CANDIDATE"},
        ${sql.json(output.profile as JSONValue)},
        ${sql.json(["说话方式", "思考方式", "价值判断"] as JSONValue)},
        ${output.preview.previewIntro},
        ${sql.json(output.preview.recommendedQuestions as JSONValue)},
        ${sql.json(output.preview.sampleAnswers as JSONValue)},
        ${output.scores.coverageScore},
        ${output.scores.groundingScore},
        ${output.scores.styleScore},
        ${output.scores.riskScore},
        ${job.id}::uuid,
        ${job.createdByUserId}::uuid,
        null,
        null,
        null,
        ${createdAt}
      )
    `;

    await sql`
      update persona_versions v
         set status = 'SUPERSEDED',
             superseded_at = ${createdAt}
        from personae p
       where p.id = v.persona_id
         and p.id = ${job.personaId}::uuid
         and v.id <> ${versionId}::uuid
         and v.status = 'CANDIDATE'
         and p.current_draft_version_id is distinct from v.id
         and p.current_published_version_id is distinct from v.id
    `;

    for (const source of approvedSources) {
      await sql`
        insert into persona_version_sources (
          id,
          persona_version_id,
          source_id,
          document_id,
          created_at
        ) values (
          ${randomUUID()}::uuid,
          ${versionId}::uuid,
          ${source.sourceId}::uuid,
          ${source.documentId}::uuid,
          ${createdAt}
        )
        on conflict (persona_version_id, source_id, document_id) do nothing
      `;
    }

    await sql`
      update personae
         set status = case
               when current_published_version_id is null and current_draft_version_id is null then 'READY'::persona_status
               else status
             end,
             updated_at = ${createdAt}
       where id = ${job.personaId}::uuid
    `;

    await sql`
      update persona_distill_jobs
         set status = 'SUCCEEDED',
             current_step = '已生成候选',
             progress = 100,
             result_version_id = ${versionId}::uuid,
             quality_scores_json = ${sql.json(output.scores as JSONValue)},
             error_code = null,
             error_message = null,
             heartbeat_at = now(),
             updated_at = ${createdAt}
       where id = ${job.id}::uuid
    `;

    await upsertOwnedObjectForJob(sql, {
      job,
      status: "PENDING_CONFIRM",
      activePersonaVersionId: versionId,
      intro: output.preview.previewIntro,
      updatedAt: createdAt,
    });

    await sql`
      insert into persona_distill_artifacts (
        id,
        job_id,
        stage,
        artifact_json
      ) values (
        ${randomUUID()}::uuid,
        ${job.id}::uuid,
        ${"candidate_version"},
        ${sql.json({ versionId, scores: output.scores } as JSONValue)}
      )
    `;
    logDistillEvent(logger, "info", "persona_distill.artifact.persisted", {
      jobId: job.id,
      personaId: job.personaId,
      actorUserId: job.createdByUserId,
      status: "CREATED",
      artifact: { stage: "candidate_version", versionId, scores: output.scores },
    });

    return versionId;
  });

const getSourceCoverageMissingReasons = (input: {
  candidates: CandidateRow[];
  minimumSources: number;
  minimumBuckets: number;
}) => {
  const reasons: string[] = [];
  const usableCandidates = input.candidates.filter((candidate) => asStringArray(candidate.riskFlags).length === 0);
  const bucketCount = new Set(usableCandidates.map((candidate) => candidate.bucket)).size;
  const primaryOrSecondaryCount = usableCandidates.filter(
    (candidate) => candidate.sourceKind === "PRIMARY" || candidate.sourceKind === "SECONDARY",
  ).length;

  if (usableCandidates.length < input.minimumSources) {
    reasons.push(`至少需要 ${input.minimumSources} 条可用资料`);
  }
  if (bucketCount < input.minimumBuckets) {
    reasons.push(`至少需要覆盖 ${input.minimumBuckets} 类证据桶`);
  }
  if (primaryOrSecondaryCount < 1) {
    reasons.push("至少需要 1 条 PRIMARY 或 SECONDARY 资料");
  }
  return reasons;
};

const getDeterministicMissingRequirements = (memory: DistillToolMemory) => {
  if (memory.coverageMissingRequirements.length > 0) {
    return memory.coverageMissingRequirements;
  }
  if (memory.validationMissingRequirements.length > 0) {
    return memory.validationMissingRequirements;
  }
  return [];
};

const buildNeedsSourcesUserMessage = (requirements: string[]) =>
  requirements.length > 0 ? "需要补充资料" : "资料还不够，需要补充一些可用资料。";

const buildMemorySnapshot = (memory: DistillToolMemory): DistillToolMemorySnapshot => ({
  candidateCount: memory.candidates.length,
  usableCandidateCount: memory.usableCandidates.length,
  approvedSourceCount: memory.approvedSources.length,
  coverageMissingRequirements: memory.coverageMissingRequirements,
  validationMissingRequirements: memory.validationMissingRequirements,
  hasGeneratedProfile: Boolean(memory.output),
  persistedVersionId: memory.persistedVersionId,
});

const buildPlannerJobContext = (job: JobRow): DistillPlannerJobContext => ({
  jobId: job.id,
  intentId: job.intentId,
  discoveryId: job.discoveryId,
  actorUserId: job.createdByUserId,
  personaId: job.personaId,
  runtimeState: "START",
  normalizedName: job.normalizedName,
  displayName: job.normalizedName,
  entityType: job.entityType,
  riskDecision: job.riskDecision,
  riskReasons: asStringArray(job.riskReasons),
  selectedSourceCandidateIds: asStringArray(job.selectedSourceCandidateIds),
  selectedExtraSourceIds: asStringArray(job.selectedExtraSourceIds),
});

type ToolInput<TToolName extends DistillToolName> = Extract<DistillToolCall, { toolName: TToolName }>["input"];

const parseToolInput = <TToolName extends DistillToolName>(
  toolName: TToolName,
  input: unknown,
): ToolInput<TToolName> => {
  const parsed = distillToolCallSchema.parse({ toolName, input }) as DistillToolCall;
  return parsed.input as unknown as ToolInput<TToolName>;
};

const toolResult = (input: DistillToolResult) => distillToolResultSchema.parse(input);

const buildPersonaDistillToolHandlers = (job: JobRow, memory: DistillToolMemory, logger?: DistillLogger) =>
  new Map<DistillToolName, DistillToolHandler>([
    [
      "check_distill_intent_risk",
      {
        toolName: "check_distill_intent_risk",
        async execute(input) {
          const parsed = parseToolInput("check_distill_intent_risk", input);
          if (parsed.intentId !== job.intentId) {
            throw new Error("intentId does not match job context");
          }
          if (parsed.normalizedName !== job.normalizedName) {
            throw new Error("normalizedName does not match job context");
          }
          if (parsed.entityType !== job.entityType) {
            throw new Error("entityType does not match job context");
          }
          if (parsed.riskDecision !== job.riskDecision) {
            throw new Error("riskDecision does not match job context");
          }
          if (parsed.riskDecision !== "ALLOW") {
            throw new Error("当前对象未通过风险判断，不能创建蒸馏任务");
          }
          return toolResult({
            ok: true,
            stateAfter: "RISK_CHECKED",
            summary: "风险判断已通过。",
            data: {
              riskDecision: parsed.riskDecision,
            },
          });
        },
      },
    ],
    [
      "search_sources",
      {
        toolName: "search_sources",
        async execute(input) {
          const parsed = parseToolInput("search_sources", input);
          if (parsed.discoveryId !== job.discoveryId) {
            throw new Error("discoveryId does not match job context");
          }
          assertSameStringSet(parsed.selectedSourceCandidateIds, asStringArray(job.selectedSourceCandidateIds), "selectedSourceCandidateIds");
          assertSameStringSet(parsed.selectedExtraSourceIds, asStringArray(job.selectedExtraSourceIds), "selectedExtraSourceIds");
          await updateJobProgress(job.id, "INGESTING", "准备资料", 15, logger);
          memory.candidates = await loadSelectedCandidates(job);
          return toolResult({
            ok: true,
            stateAfter: "SOURCES_COLLECTED",
            summary: `已读取 ${memory.candidates.length} 条用户确认资料。`,
            data: {
              candidateCount: memory.candidates.length,
            },
          });
        },
      },
    ],
    [
      "clean_sources",
      {
        toolName: "clean_sources",
        async execute(input) {
          const parsed = parseToolInput("clean_sources", input);
          await updateJobProgress(job.id, "INGESTING", "清洗资料", 25, logger);
          memory.usableCandidates = memory.candidates.filter(
            (candidate) =>
              asStringArray(candidate.riskFlags).length === 0 &&
              (!parsed.dropLowTrustSources || candidate.trustLevel !== "LOW"),
          );
          const createdAt = new Date().toISOString();
          memory.approvedSources = await withTransaction(async (sql) => {
            const sources = [];
            for (const candidate of memory.usableCandidates) {
              sources.push(await createApprovedSourceSnapshot(sql, job, candidate, createdAt));
            }
            return sources;
          });
          return toolResult({
            ok: true,
            stateAfter: "SOURCES_CLEANED",
            summary: `已清洗 ${memory.usableCandidates.length} 条可用资料。`,
            data: {
              usableCandidateCount: memory.usableCandidates.length,
              approvedSourceCount: memory.approvedSources.length,
            },
          });
        },
      },
    ],
    [
      "extract_evidence",
      {
        toolName: "extract_evidence",
        async execute(input) {
          parseToolInput("extract_evidence", input);
          await updateJobProgress(job.id, "EXTRACTING", "抽取证据", 35, logger);
          return toolResult({
            ok: true,
            stateAfter: "EVIDENCE_EXTRACTED",
            summary: `已准备 ${memory.approvedSources.length} 条证据片段。`,
            data: {
              evidenceSpanCount: memory.approvedSources.length,
            },
          });
        },
      },
    ],
    [
      "score_source_coverage",
      {
        toolName: "score_source_coverage",
        async execute(input) {
          const parsed = parseToolInput("score_source_coverage", input);
          memory.coverageMissingRequirements = getSourceCoverageMissingReasons({
            candidates: memory.usableCandidates,
            minimumSources: parsed.minimumSources,
            minimumBuckets: parsed.minimumBuckets,
          });
          await updateJobProgress(
            job.id,
            memory.coverageMissingRequirements.length > 0 ? "VALIDATING" : "SYNTHESIZING",
            memory.coverageMissingRequirements.length > 0 ? "需要补充资料" : "资料可用",
            45,
            logger,
          );
          return toolResult({
            ok: memory.coverageMissingRequirements.length === 0,
            stateAfter: "COVERAGE_SCORED",
            summary:
              memory.coverageMissingRequirements.length === 0
                ? "资料覆盖通过。"
                : `资料覆盖不足：${memory.coverageMissingRequirements.join("；")}`,
            data: {
              missingRequirements: memory.coverageMissingRequirements,
              usableCandidateCount: memory.usableCandidates.length,
            },
          });
        },
      },
    ],
    [
      "generate_persona_profile",
      {
        toolName: "generate_persona_profile",
        async execute(input) {
          const parsed = parseToolInput("generate_persona_profile", input);
          if (parsed.displayName !== job.normalizedName) {
            throw new Error("displayName does not match job context");
          }
          if (memory.coverageMissingRequirements.length > 0) {
            throw new Error("资料覆盖不足，不能生成 profile");
          }
          await updateJobProgress(job.id, "SYNTHESIZING", "合成人物画像", 55, logger);
          memory.output = await runDistillJob({
            displayName: job.normalizedName,
            distillFocus: parsed.distillFocus,
            approvedSources: memory.approvedSources.map((source) => ({
              sourceId: source.sourceId,
              sourceKind: source.sourceKind,
              title: source.title,
              summary: source.summary,
            })),
          });
          return toolResult({
            ok: true,
            stateAfter: "PROFILE_GENERATED",
            summary: "人物 profile 已生成。",
            data: {
              scores: memory.output.scores,
            },
          });
        },
      },
    ],
    [
      "validate_persona_profile",
      {
        toolName: "validate_persona_profile",
        async execute(input) {
          parseToolInput("validate_persona_profile", input);
          if (!memory.output) {
            throw new Error("profile has not been generated");
          }
          await updateJobProgress(job.id, "VALIDATING", "校验质量", 75, logger);
          memory.validationMissingRequirements = getPreviewGateMissingReasons(memory.output, memory.usableCandidates);
          return toolResult({
            ok: memory.validationMissingRequirements.length === 0,
            stateAfter: "PROFILE_VALIDATED",
            summary:
              memory.validationMissingRequirements.length === 0
                ? "人物 profile 已通过校验。"
                : `人物 profile 仍需补资料：${memory.validationMissingRequirements.join("；")}`,
            data: {
              missingRequirements: memory.validationMissingRequirements,
              scores: memory.output.scores,
            },
          });
        },
      },
    ],
    [
      "persist_persona_candidate",
      {
        toolName: "persist_persona_candidate",
        async execute(input) {
          const parsed = parseToolInput("persist_persona_candidate", input);
          if (!parsed.idempotencyKey.includes(job.id)) {
            throw new Error("idempotencyKey does not match job context");
          }
          if (!memory.output) {
            throw new Error("profile has not been generated");
          }
          if (memory.coverageMissingRequirements.length > 0 || memory.validationMissingRequirements.length > 0) {
            throw new Error("profile is not valid enough to persist");
          }
          await updateJobProgress(job.id, "PERSISTING", "保存候选", 90, logger);
          memory.persistedVersionId = await persistCandidateVersion(job, memory.approvedSources, memory.output, logger);
          return toolResult({
            ok: true,
            stateAfter: "PERSISTED",
            summary: "候选对象已保存。",
            data: {
              versionId: memory.persistedVersionId,
            },
          });
        },
      },
    ],
    [
      "mark_job_needs_sources",
      {
        toolName: "mark_job_needs_sources",
        async execute(input) {
          parseToolInput("mark_job_needs_sources", input);
          const missingRequirements = getDeterministicMissingRequirements(memory);
          if (missingRequirements.length === 0) {
            throw new Error("missing requirements have not been determined by deterministic validation");
          }
          const userMessage = buildNeedsSourcesUserMessage(missingRequirements);
          const sql = getSql();
          await sql`
            update persona_distill_jobs
               set status = 'NEEDS_MORE_SOURCES',
                   current_step = ${userMessage},
                   progress = 80,
                   quality_scores_json = ${memory.output ? sql.json(memory.output.scores as JSONValue) : null},
                   missing_requirements_json = ${sql.json(missingRequirements as JSONValue)},
                   heartbeat_at = now(),
                   updated_at = now()
             where id = ${job.id}::uuid
          `;
          await upsertOwnedObjectForJob(sql, {
            job,
            status: "NEEDS_SOURCES",
          });
          return toolResult({
            ok: true,
            stateAfter: "NEEDS_SOURCES",
            summary: userMessage,
            data: {
              missingRequirements,
            },
          });
        },
      },
    ],
    [
      "mark_job_failed",
      {
        toolName: "mark_job_failed",
        async execute(input, context) {
          parseToolInput("mark_job_failed", input);
          if (!context.allowSystemFailure) {
            throw new Error("mark_job_failed is system-controlled");
          }
          const errorCode = "DISTILL_TOOL_LOOP_FAILED";
          const errorMessage = "生成失败，可以稍后重试。";
          const sql = getSql();
          await sql`
            update persona_distill_jobs
               set status = 'FAILED',
                   current_step = '蒸馏失败',
                   progress = 100,
                   error_code = ${errorCode},
                   error_message = ${errorMessage},
                   updated_at = now()
             where id = ${job.id}::uuid
          `;
          await upsertOwnedObjectForJob(sql, {
            job,
            status: "FAILED",
          });
          return toolResult({
            ok: false,
            stateAfter: "FAILED",
            summary: "蒸馏失败。",
            data: {
              code: errorCode,
              retryable: true,
            },
          });
        },
      },
    ],
  ]);

const readMaxToolCalls = () => {
  const parsed = Number(process.env.PERSONA_DISTILL_MAX_TOOL_CALLS ?? "12");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
};

const runOneJob = async (job: JobRow, logger?: DistillLogger) => {
  logDistillEvent(logger, "info", "persona_distill.job.started", {
    jobId: job.id,
    personaId: job.personaId,
    actorUserId: job.createdByUserId,
    status: "CLAIMED",
    attemptCount: job.attemptCount + 1,
  });
  try {
    const memory: DistillToolMemory = {
      candidates: [],
      usableCandidates: [],
      approvedSources: [],
      coverageMissingRequirements: [],
      validationMissingRequirements: [],
      output: null,
      persistedVersionId: null,
    };
    const result = await runDistillToolLoop({
      job: buildPlannerJobContext(job),
      context: {
        jobId: job.id,
        actorUserId: job.createdByUserId,
        personaId: job.personaId,
      },
      planner: buildDistillPlannerFromEnv(),
      handlers: buildPersonaDistillToolHandlers(job, memory, logger),
      getMemorySnapshot: () => buildMemorySnapshot(memory),
      maxToolCalls: readMaxToolCalls(),
      logger,
    });
    logDistillEvent(logger, "info", "persona_distill.job.completed", {
      jobId: job.id,
      personaId: job.personaId,
      actorUserId: job.createdByUserId,
      status: result.status,
    });

    return { status: result.status };
  } catch (error) {
    logDistillEvent(logger, "error", "persona_distill.job.failed", {
      jobId: job.id,
      personaId: job.personaId,
      actorUserId: job.createdByUserId,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "unknown error",
    });
    const sql = getSql();
    await sql`
      update persona_distill_jobs
         set status = 'FAILED',
             current_step = '蒸馏失败',
             progress = 100,
             error_code = ${"DISTILL_JOB_FAILED"},
             error_message = ${error instanceof Error ? error.message : "unknown error"},
             updated_at = now()
       where id = ${job.id}::uuid
    `;
    await upsertOwnedObjectForJob(sql, {
      job,
      status: "FAILED",
    });
    return { status: "failed" as const };
  }
};

export const runDuePersonaDistillJobs = async (input: { batchSize?: number; logger?: DistillLogger } = {}) => {
  const jobs = await claimJobs(input.batchSize ?? 5);
  let succeeded = 0;
  let failed = 0;
  let needsMoreSources = 0;

  for (const job of jobs) {
    logDistillEvent(input.logger, "info", "persona_distill.job.claimed", {
      jobId: job.id,
      personaId: job.personaId,
      actorUserId: job.createdByUserId,
      status: "CLAIMED",
      attemptCount: job.attemptCount + 1,
    });
    const result = await runOneJob(job, input.logger);
    if (result.status === "succeeded") {
      succeeded += 1;
    } else if (result.status === "needs_more_sources") {
      needsMoreSources += 1;
    } else {
      failed += 1;
    }
  }

  return {
    claimed: jobs.length,
    succeeded,
    failed,
    needsMoreSources,
  };
};
