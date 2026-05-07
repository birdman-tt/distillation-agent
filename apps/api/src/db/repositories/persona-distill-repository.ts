import { createHash, randomUUID } from "node:crypto";
import type { JSONValue } from "postgres";
import { sanitizeDistillToolTraceJson } from "@hall-of-fame/contracts";
import {
  buildSourceCandidatesFromWebContext,
  buildDiscoveryQualityWarnings,
  createBucketCoverage,
  evidenceBuckets as buckets,
  type EvidenceBucket,
  type SourceCategory,
  type SourceKind,
  type TrustLevel,
} from "@hall-of-fame/domain";
import { runKimiResearcher } from "@hall-of-fame/kimi-client";

import { getSql, withTransaction } from "../client.js";
import { publishDynamicPersonaVersion } from "./dynamic-persona-repository.js";
import { ensureUserShadow } from "./user-shadow-repository.js";

type EntityType = "REAL_PERSON" | "FICTIONAL_CHARACTER" | "UNKNOWN";
type RiskDecision = "ALLOW" | "NEED_REVIEW" | "BLOCK";
type JobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "INGESTING"
  | "EXTRACTING"
  | "SYNTHESIZING"
  | "VALIDATING"
  | "PERSISTING"
  | "SUCCEEDED"
  | "NEEDS_MORE_SOURCES"
  | "FAILED"
  | "BLOCKED"
  | "SUPERSEDED";
type SourceDiscoveryJobStatus = "QUEUED" | "CLAIMED" | "SEARCHING" | "PERSISTING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
type MyObjectStatus = "CREATING" | "NEEDS_SOURCES" | "PENDING_CONFIRM" | "READY" | "PUBLIC" | "FAILED";

const distillPublishGate = {
  coverageScoreMinimum: 70,
  groundingScoreMinimum: 75,
  styleScoreMinimum: 70,
  riskScoreMaximum: 35,
  sourceCountMinimum: 4,
  bucketCountMinimum: 3,
  primaryOrSecondaryCountMinimum: 1,
  nonLowTrustCountMinimum: 1,
};
const sanitizerVersion = "distill-discovery-v1";
const syntheticSanitizerVersion = "distill-discovery-v1-dev-synthetic";

const toIsoString = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");
const hasKimiDiscoveryConfig = () =>
  process.env.KIMI_WEB_SEARCH_ENABLED === "true" &&
  Boolean(process.env.KIMI_API_KEY?.trim() || process.env.MOONSHOT_API_KEY?.trim());
const shouldUseKimiDiscovery = () => {
  const flag = process.env.PERSONA_DISTILL_KIMI_DISCOVERY_ENABLED;
  if (flag === "true") {
    return true;
  }
  if (flag === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production" && hasKimiDiscoveryConfig();
};
const shouldAllowSyntheticDiscovery = () => process.env.PERSONA_DISTILL_SYNTHETIC_DISCOVERY_ENABLED === "true";

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

type IntentRow = {
  id: string;
  createdByUserId: string;
  query: string;
  normalizedName: string;
  entityType: EntityType;
  usageIntent: string;
  focus: unknown;
  riskDecision: RiskDecision;
  riskReasons: unknown;
  coverageHint: "ENOUGH" | "LOW" | "NONE";
  nextStep: "DISCOVER_SOURCES" | "NEED_REVIEW" | "BLOCKED";
  createdAt: Date;
};

type DiscoveryRow = {
  id: string;
  intentId: string;
  createdByUserId: string;
  bucketCoverage: unknown;
  missingBuckets: unknown;
  qualityWarnings: unknown;
  sanitizerVersion: string;
  createdAt: Date;
};

type SourceCandidateRow = {
  id: string;
  discoveryId: string;
  bucket: EvidenceBucket;
  title: string;
  url: string | null;
  normalizedUrlHash: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  snippet: string;
  sourceKind: SourceKind;
  trustLevel: TrustLevel;
  sourceCategory: SourceCategory;
  isPrimary: boolean;
  recommended: boolean;
  recommendationReason: string;
  dedupeKey: string;
  riskFlags: unknown;
  extraSourceId: string | null;
  createdAt: Date;
};

type SourceDiscoveryJobRow = {
  id: string;
  intentId: string;
  createdByUserId: string;
  preferredLanguage: string;
  maxSourcesPerBucket: number;
  status: SourceDiscoveryJobStatus;
  currentStep: string;
  progress: number;
  discoveryId: string | null;
  sourceCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  safeErrorMessage: string | null;
  retryable: boolean;
  nextRunAt: Date;
  claimedByWorkerId: string | null;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type ExtraSourceRow = {
  id: string;
  discoveryId: string;
  createdByUserId: string;
  inputType: "TEXT" | "URL";
  title: string | null;
  url: string | null;
  content: string | null;
  sourceKind: SourceKind;
  status: "PENDING" | "USABLE" | "REJECTED";
  rejectionReason: string | null;
  sourceCandidateId: string | null;
  createdAt: Date;
};

type JobRow = {
  id: string;
  createdByUserId: string;
  intentId: string;
  discoveryId: string;
  personaId: string | null;
  resultVersionId: string | null;
  query: string;
  normalizedName: string;
  entityType: EntityType;
  riskDecision: RiskDecision;
  status: JobStatus;
  currentStep: string;
  progress: number;
  selectedSourceCandidateIds: unknown;
  selectedExtraSourceIds: unknown;
  qualityScoresJson: unknown;
  missingRequirementsJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ToolRunTraceRow = {
  seq: number;
  toolName: string;
  runtimeStateBefore: string;
  runtimeStateAfter: string | null;
  inputJson: unknown;
  outputJson: unknown;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type ArtifactTraceRow = {
  stage: string;
  artifactJson: unknown;
  createdAt: Date;
};

const selectIntentColumns = `
  id,
  created_by_user_id as "createdByUserId",
  query,
  normalized_name as "normalizedName",
  entity_type as "entityType",
  usage_intent as "usageIntent",
  focus,
  risk_decision as "riskDecision",
  risk_reasons as "riskReasons",
  coverage_hint as "coverageHint",
  next_step as "nextStep",
  created_at as "createdAt"
`;

const selectDiscoveryColumns = `
  id,
  intent_id as "intentId",
  created_by_user_id as "createdByUserId",
  bucket_coverage as "bucketCoverage",
  missing_buckets as "missingBuckets",
  quality_warnings as "qualityWarnings",
  sanitizer_version as "sanitizerVersion",
  created_at as "createdAt"
`;

const selectSourceDiscoveryJobColumns = `
  id,
  intent_id as "intentId",
  created_by_user_id as "createdByUserId",
  preferred_language as "preferredLanguage",
  max_sources_per_bucket as "maxSourcesPerBucket",
  status,
  current_step as "currentStep",
  progress,
  discovery_id as "discoveryId",
  source_count as "sourceCount",
  error_code as "errorCode",
  error_message as "errorMessage",
  safe_error_message as "safeErrorMessage",
  retryable,
  next_run_at as "nextRunAt",
  claimed_by_worker_id as "claimedByWorkerId",
  claimed_at as "claimedAt",
  heartbeat_at as "heartbeatAt",
  attempt_count as "attemptCount",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const selectCandidateColumns = `
  id,
  discovery_id as "discoveryId",
  bucket,
  title,
  url,
  normalized_url_hash as "normalizedUrlHash",
  publisher,
  author,
  published_at as "publishedAt",
  snippet,
  source_kind as "sourceKind",
  trust_level as "trustLevel",
  source_category as "sourceCategory",
  is_primary as "isPrimary",
  recommended,
  recommendation_reason as "recommendationReason",
  dedupe_key as "dedupeKey",
  risk_flags as "riskFlags",
  extra_source_id as "extraSourceId",
  created_at as "createdAt"
`;

const selectExtraSourceColumns = `
  id,
  discovery_id as "discoveryId",
  created_by_user_id as "createdByUserId",
  input_type as "inputType",
  title,
  url,
  content,
  source_kind as "sourceKind",
  status,
  rejection_reason as "rejectionReason",
  source_candidate_id as "sourceCandidateId",
  created_at as "createdAt"
`;

const selectJobColumns = `
  id,
  created_by_user_id as "createdByUserId",
  intent_id as "intentId",
  discovery_id as "discoveryId",
  persona_id as "personaId",
  result_version_id as "resultVersionId",
  query,
  normalized_name as "normalizedName",
  entity_type as "entityType",
  risk_decision as "riskDecision",
  status,
  current_step as "currentStep",
  progress,
  selected_source_candidate_ids as "selectedSourceCandidateIds",
  selected_extra_source_ids as "selectedExtraSourceIds",
  quality_scores_json as "qualityScoresJson",
  missing_requirements_json as "missingRequirementsJson",
  error_code as "errorCode",
  error_message as "errorMessage",
  claimed_at as "claimedAt",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const inferEntityType = (normalizedName: string): EntityType => {
  if (/小说|角色|动漫|漫画|游戏|虚拟|主角|反派/u.test(normalizedName)) {
    return "FICTIONAL_CHARACTER";
  }
  if (/测试|对象|人物/u.test(normalizedName)) {
    return "UNKNOWN";
  }
  return "REAL_PERSON";
};

const assessRisk = (
  normalizedName: string,
): {
  riskDecision: RiskDecision;
  riskReasons: string[];
  nextStep: "DISCOVER_SOURCES" | "NEED_REVIEW" | "BLOCKED";
} => {
  if (/政治局|总统|主席|战争|恐怖|诈骗|犯罪|极端/u.test(normalizedName)) {
    return {
      riskDecision: "NEED_REVIEW",
      riskReasons: ["命中高风险或现实政治敏感词，需要人工确认后再蒸馏。"],
      nextStep: "NEED_REVIEW",
    };
  }
  return {
    riskDecision: "ALLOW",
    riskReasons: [],
    nextStep: "DISCOVER_SOURCES",
  };
};

const buildSyntheticCandidates = (normalizedName: string) => {
  const sourceSeed = [
    {
      bucket: "WRITINGS" as const,
      title: `${normalizedName} 的开发占位资料 1`,
      url: null,
      publisher: "开发占位资料",
      snippet: `${normalizedName} 的开发占位表达材料，仅用于本地/测试环境打通蒸馏流程。生产环境必须使用真实可追溯来源。`,
      sourceKind: "PRIMARY" as const,
      trustLevel: "LOW" as const,
      sourceCategory: "unknown" as const,
      isPrimary: true,
      recommended: true,
      recommendationReason: "本地/测试环境占位资料，不能作为生产证据。",
    },
    {
      bucket: "CONVERSATIONS" as const,
      title: `${normalizedName} 的开发占位资料 2`,
      url: null,
      publisher: "开发占位资料",
      snippet: `${normalizedName} 的开发占位对话材料，仅用于本地/测试环境打通资料确认和任务执行。`,
      sourceKind: "SECONDARY" as const,
      trustLevel: "LOW" as const,
      sourceCategory: "unknown" as const,
      isPrimary: false,
      recommended: true,
      recommendationReason: "本地/测试环境占位资料，不能作为生产证据。",
    },
    {
      bucket: "EXPRESSION_DNA" as const,
      title: `${normalizedName} 的开发占位资料 3`,
      url: null,
      publisher: "开发占位资料",
      snippet: `${normalizedName} 的开发占位风格材料，仅用于本地/测试环境验证 profile 生成与预览链路。`,
      sourceKind: "SUMMARY" as const,
      trustLevel: "LOW" as const,
      sourceCategory: "unknown" as const,
      isPrimary: false,
      recommended: true,
      recommendationReason: "本地/测试环境占位资料，不能作为生产证据。",
    },
    {
      bucket: "TIMELINE" as const,
      title: `${normalizedName} 的开发占位资料 4`,
      url: null,
      publisher: "开发占位资料",
      snippet: `${normalizedName} 的开发占位经历材料，用于本地/测试环境扩展资料覆盖。`,
      sourceKind: "SECONDARY" as const,
      trustLevel: "LOW" as const,
      sourceCategory: "unknown" as const,
      isPrimary: false,
      recommended: false,
      recommendationReason: "本地/测试环境占位资料，不能作为生产证据。",
    },
  ];

  return sourceSeed.map((item) => ({
    ...item,
    sourceCandidateId: randomUUID(),
    normalizedUrlHash: item.url ? hashValue(item.url) : null,
    author: null,
    publishedAt: null,
    dedupeKey: hashValue(`${normalizedName}:${item.bucket}:${item.title}`),
    riskFlags: [] as string[],
  }));
};

const buildKimiCandidates = async (normalizedName: string) => {
  const now = new Date();
  const webContext = await runKimiResearcher({
    userMessage: `为一键蒸馏对象“${normalizedName}”查找可追溯资料来源`,
    researchPlan: {
      subject: normalizedName,
      subjectType: "persona",
      normalizedQuestion: `查找 ${normalizedName} 的公开资料、访谈、作品或可靠介绍，用于人物对话蒸馏`,
      searchQueries: [
        `${normalizedName} 公开资料 访谈 作品`,
        `${normalizedName} 生平 观点 代表表达`,
        `${normalizedName} 人物 风格 资料`,
      ],
      freshnessRequirement: "latest_available",
      timeWindow: "latest_available",
      evidenceRequirement: {
        minSources: 3,
        requireUrl: true,
      },
      ifNoReliableSource: "say_not_found_do_not_guess",
      asOf: now.toISOString(),
      timezone: "Asia/Shanghai",
      currentYear: now.getFullYear(),
    },
    plannerReason: "one-click persona distill source discovery",
    locale: "zh-CN",
    maxFindings: 6,
  });

  return buildSourceCandidatesFromWebContext({
    normalizedName,
    sources: webContext.sources,
    createSourceCandidateId: randomUUID,
    hashValue,
    maxCandidates: 6,
  });
};

const discoverSourceCandidates = async (normalizedName: string) => {
  if (shouldUseKimiDiscovery()) {
    const candidates = await buildKimiCandidates(normalizedName);
    if (candidates.length > 0) {
      return {
        candidates,
        sanitizerVersion,
        warnings: [] as string[],
      };
    }
  }

  if (!shouldAllowSyntheticDiscovery()) {
    throw new Error("资料搜索未配置，生产环境不能使用占位来源");
  }

  return {
    candidates: buildSyntheticCandidates(normalizedName),
    sanitizerVersion: syntheticSanitizerVersion,
    warnings: ["当前使用本地/测试占位资料。生产环境必须启用真实资料搜索。"],
  };
};

const mapIntent = (row: IntentRow) => ({
  intentId: row.id,
  normalizedName: row.normalizedName,
  entityType: row.entityType,
  riskDecision: row.riskDecision,
  riskReasons: asStringArray(row.riskReasons),
  coverageHint: row.coverageHint,
  nextStep: row.nextStep,
});

const mapCandidate = (row: SourceCandidateRow) => ({
  sourceCandidateId: row.id,
  bucket: row.bucket,
  title: row.title,
  url: row.url,
  normalizedUrlHash: row.normalizedUrlHash,
  publisher: row.publisher,
  author: row.author,
  publishedAt: row.publishedAt,
  snippet: row.snippet,
  sourceKind: row.sourceKind,
  trustLevel: row.trustLevel,
  sourceCategory: row.sourceCategory,
  isPrimary: row.isPrimary,
  recommended: row.recommended,
  recommendationReason: row.recommendationReason,
  dedupeKey: row.dedupeKey,
  riskFlags: asStringArray(row.riskFlags),
});

const mapExtraCandidate = (row: ExtraSourceRow & { candidate: SourceCandidateRow | null }) => ({
  ...(row.candidate
    ? mapCandidate(row.candidate)
    : {
        sourceCandidateId: row.sourceCandidateId ?? randomUUID(),
        bucket: "WRITINGS" as const,
        title: row.title ?? row.url ?? "用户补充资料",
        url: row.url,
        normalizedUrlHash: row.url ? hashValue(row.url) : null,
        publisher: "用户补充",
        author: null,
        publishedAt: null,
        snippet: row.content?.slice(0, 180) ?? row.url ?? "用户补充资料",
        sourceKind: row.sourceKind,
        trustLevel: "MEDIUM" as const,
        sourceCategory: "unknown" as const,
        isPrimary: row.sourceKind === "PRIMARY",
        recommended: row.status === "USABLE",
        recommendationReason: row.status === "USABLE" ? "用户补充资料通过基础清洗，可用于蒸馏。" : "资料暂不可用。",
        dedupeKey: hashValue(`${row.id}:${row.title ?? row.url ?? ""}`),
        riskFlags: [] as string[],
      }),
  extraSourceId: row.id,
  status: row.status,
  rejectionReason: row.rejectionReason,
});

const mapDiscovery = (row: DiscoveryRow, candidates: SourceCandidateRow[]) => {
  const coverage = asRecord(row.bucketCoverage);
  const bucketCoverage = buckets.reduce<Record<EvidenceBucket, number>>((acc, bucket) => {
    acc[bucket] = Number(coverage[bucket] ?? 0);
    return acc;
  }, {} as Record<EvidenceBucket, number>);
  const intentPlaceholder = null;
  void intentPlaceholder;

  return {
    discoveryId: row.id,
    normalizedName: "",
    entityType: "UNKNOWN" as EntityType,
    riskDecision: "ALLOW" as RiskDecision,
    bucketCoverage,
    sourceCandidates: candidates.map(mapCandidate),
    missingBuckets: asStringArray(row.missingBuckets) as EvidenceBucket[],
    qualityWarnings: asStringArray(row.qualityWarnings),
    sanitizerVersion: row.sanitizerVersion,
  };
};

const loadIntent = async (intentId: string, actorUserId?: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<IntentRow[]>(`select ${selectIntentColumns} from persona_distill_intents where id = $1`, [
    intentId,
  ]);
  const row = rows[0];
  if (!row || (actorUserId && row.createdByUserId !== actorUserId)) {
    return null;
  }
  return row;
};

const loadDiscovery = async (discoveryId: string, actorUserId?: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<DiscoveryRow[]>(
    `select ${selectDiscoveryColumns} from persona_distill_discoveries where id = $1`,
    [discoveryId],
  );
  const row = rows[0];
  if (!row || (actorUserId && row.createdByUserId !== actorUserId)) {
    return null;
  }
  return row;
};

const listCandidatesByDiscovery = async (discoveryId: string) => {
  const sql = getSql();
  return sql.unsafe<SourceCandidateRow[]>(
    `select ${selectCandidateColumns}
       from persona_distill_source_candidates
      where discovery_id = $1
      order by recommended desc, created_at asc`,
    [discoveryId],
  );
};

const listExtraSourcesByDiscovery = async (discoveryId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<ExtraSourceRow[]>(
    `select ${selectExtraSourceColumns}
       from persona_distill_extra_sources
      where discovery_id = $1
      order by created_at asc`,
    [discoveryId],
  );
  const candidates = await listCandidatesByDiscovery(discoveryId);
  return rows.map((row) => ({
    ...row,
    candidate: candidates.find((candidate) => candidate.extraSourceId === row.id || candidate.id === row.sourceCandidateId) ?? null,
  }));
};

const buildDiscoveryResponse = async (discovery: DiscoveryRow, intent: IntentRow) => {
  const candidates = await listCandidatesByDiscovery(discovery.id);
  const response = mapDiscovery(discovery, candidates);
  return {
    ...response,
    normalizedName: intent.normalizedName,
    entityType: intent.entityType,
    riskDecision: intent.riskDecision,
  };
};

const sourceDiscoveryActiveStatuses = ["QUEUED", "CLAIMED", "SEARCHING", "PERSISTING"] as const;
const sourceDiscoveryPollHref = (jobId: string) => `/v1/persona-distill-source-discovery-jobs/${jobId}`;

const loadSourceDiscoveryJob = async (sourceDiscoveryJobId: string, actorUserId?: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<SourceDiscoveryJobRow[]>(
    `select ${selectSourceDiscoveryJobColumns}
       from persona_distill_source_discovery_jobs
      where id = $1::uuid`,
    [sourceDiscoveryJobId],
  );
  const row = rows[0];
  if (!row || (actorUserId && row.createdByUserId !== actorUserId)) {
    return null;
  }
  return row;
};

const toPublicSourceDiscoveryErrorCode = (status: SourceDiscoveryJobStatus, internalCode: string | null) => {
  if (status === "BLOCKED") {
    return "SOURCE_DISCOVERY_BLOCKED";
  }

  const normalized = (internalCode ?? "").trim().toUpperCase();
  if (["KIMI_OVERLOADED", "MOONSHOT_OVERLOADED", "UPSTREAM_OVERLOADED", "429"].includes(normalized)) {
    return "SOURCE_SEARCH_BUSY";
  }
  if (normalized === "NO_SOURCE_FOUND") {
    return "SOURCE_SEARCH_NO_RESULT";
  }
  return "SOURCE_SEARCH_FAILED";
};

const toPublicSourceDiscoveryErrorMessage = (status: SourceDiscoveryJobStatus, code: string, safeErrorMessage: string | null) => {
  if (safeErrorMessage?.trim()) {
    return safeErrorMessage;
  }
  if (status === "BLOCKED") {
    return "当前对象暂不能创建，请换一个对象。";
  }
  if (code === "SOURCE_SEARCH_BUSY") {
    return "搜索服务繁忙，可以稍后重试";
  }
  if (code === "SOURCE_SEARCH_NO_RESULT") {
    return "暂时没有找到可用资料，可以重试或手动补充资料";
  }
  return "资料搜索失败，可以稍后重试";
};

const buildSourceDiscoveryJobResponse = async (job: SourceDiscoveryJobRow, actorUserId: string) => {
  const common = {
    sourceDiscoveryJobId: job.id,
    intentId: job.intentId,
    currentStep: job.currentStep,
    progress: job.progress,
  };

  if (sourceDiscoveryActiveStatuses.includes(job.status as (typeof sourceDiscoveryActiveStatuses)[number])) {
    return {
      ...common,
      status: job.status,
      discoveryId: null,
      discovery: null,
      error: null,
      nextAction: "POLL_SOURCE_DISCOVERY",
      pollHref: sourceDiscoveryPollHref(job.id),
    };
  }

  if (job.status === "SUCCEEDED") {
    if (!job.discoveryId) {
      return null;
    }
    const intent = await loadIntent(job.intentId, actorUserId);
    const discovery = await loadDiscovery(job.discoveryId, actorUserId);
    if (!intent || !discovery) {
      return null;
    }
    return {
      ...common,
      status: "SUCCEEDED",
      discoveryId: job.discoveryId,
      discovery: await buildDiscoveryResponse(discovery, intent),
      error: null,
      nextAction: "CONFIRM_SOURCES",
    };
  }

  const publicCode = toPublicSourceDiscoveryErrorCode(job.status, job.errorCode);
  const publicMessage = toPublicSourceDiscoveryErrorMessage(job.status, publicCode, job.safeErrorMessage);
  if (job.status === "BLOCKED") {
    return {
      ...common,
      status: "BLOCKED",
      discoveryId: null,
      discovery: null,
      error: {
        code: publicCode,
        message: publicMessage,
        retryable: false,
      },
      nextAction: "SOURCE_DISCOVERY_BLOCKED",
    };
  }

  return {
    ...common,
    status: "FAILED",
    discoveryId: null,
    discovery: null,
    error: {
      code: publicCode,
      message: publicMessage,
      retryable: true,
    },
    nextAction: "RETRY_SOURCE_DISCOVERY",
  };
};

const buildMissingRequirements = (input: {
  selectedCandidates: SourceCandidateRow[];
  entityType: EntityType;
}) => {
  const usableCandidateCount = input.selectedCandidates.filter((item) => asStringArray(item.riskFlags).length === 0).length;
  const totalUsable = usableCandidateCount;
  const coveredBuckets = new Set(input.selectedCandidates.map((item) => item.bucket)).size;
  const sourceKindCount = input.selectedCandidates.filter((item) => item.sourceKind === "PRIMARY" || item.sourceKind === "SECONDARY").length;
  const minSources = input.entityType === "FICTIONAL_CHARACTER" ? 2 : 3;
  const missing: string[] = [];

  if (totalUsable < minSources) {
    missing.push(`至少需要 ${minSources} 条可用资料`);
  }
  if (coveredBuckets < 2) {
    missing.push("至少需要覆盖 2 类证据桶");
  }
  if (sourceKindCount < 1) {
    missing.push("至少需要 1 条 PRIMARY 或 SECONDARY 资料");
  }

  return missing;
};

export const createDistillIntent = async (input: {
  query: string;
  usageIntent: "chat_companion" | "decision_lens" | "learning" | "roleplay";
  focus: string[];
  actorUserId: string;
}) => {
  await ensureUserShadow(input.actorUserId);

  const normalizedName = normalizeName(input.query);
  const entityType = inferEntityType(normalizedName);
  const risk = assessRisk(normalizedName);
  const coverageHint = normalizedName.length >= 2 ? "ENOUGH" : "LOW";
  const intentId = randomUUID();
  const sql = getSql();
  const rows = await sql<IntentRow[]>`
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
      next_step
    ) values (
      ${intentId}::uuid,
      ${input.actorUserId}::uuid,
      ${input.query},
      ${normalizedName},
      ${entityType},
      ${input.usageIntent},
      ${sql.json(input.focus as JSONValue)},
      ${risk.riskDecision},
      ${sql.json(risk.riskReasons as JSONValue)},
      ${coverageHint},
      ${risk.nextStep}
    )
    returning ${sql.unsafe(selectIntentColumns)}
  `;

  return mapIntent(rows[0]!);
};

export const createDistillSourceDiscovery = async (input: {
  intentId: string;
  actorUserId: string;
  preferredLanguage: string;
  maxSourcesPerBucket: number;
}) => {
  const intent = await loadIntent(input.intentId, input.actorUserId);
  if (!intent) {
    return null;
  }
  if (intent.riskDecision !== "ALLOW") {
    throw new Error("当前对象需要人工确认后才能搜索资料");
  }

  const sourceDiscoveryJobId = await withTransaction(async (sql) => {
    const lockKey = `persona-source-discovery:${input.actorUserId}:${intent.id}`;
    await sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    const activeRows = await sql.unsafe<SourceDiscoveryJobRow[]>(
      `select ${selectSourceDiscoveryJobColumns}
         from persona_distill_source_discovery_jobs
        where created_by_user_id = $1::uuid
          and intent_id = $2::uuid
          and status in ('QUEUED', 'CLAIMED', 'SEARCHING', 'PERSISTING')
        order by created_at asc
        limit 1`,
      [input.actorUserId, intent.id],
    );
    if (activeRows[0]) {
      return activeRows[0].id;
    }

    const newJobId = randomUUID();
    const now = new Date().toISOString();
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
        next_run_at,
        created_at,
        updated_at
      ) values (
        ${newJobId}::uuid,
        ${intent.id}::uuid,
        ${input.actorUserId}::uuid,
        ${input.preferredLanguage},
        ${input.maxSourcesPerBucket},
        ${"QUEUED"},
        ${"准备搜索资料"},
        ${5},
        ${now},
        ${now},
        ${now}
      )
    `;
    return newJobId;
  });

  return getDistillSourceDiscoveryJob(sourceDiscoveryJobId, input.actorUserId);
};

export const getDistillSourceDiscoveryJob = async (sourceDiscoveryJobId: string, actorUserId: string) => {
  const job = await loadSourceDiscoveryJob(sourceDiscoveryJobId, actorUserId);
  return job ? buildSourceDiscoveryJobResponse(job, actorUserId) : null;
};

export const retryDistillSourceDiscoveryJob = async (sourceDiscoveryJobId: string, actorUserId: string) => {
  const newSourceDiscoveryJobId = await withTransaction(async (sql) => {
    const failedRows = await sql.unsafe<SourceDiscoveryJobRow[]>(
      `select ${selectSourceDiscoveryJobColumns}
         from persona_distill_source_discovery_jobs
        where id = $1::uuid
        for update`,
      [sourceDiscoveryJobId],
    );
    const failedJob = failedRows[0];
    if (!failedJob || failedJob.createdByUserId !== actorUserId) {
      return null;
    }
    if (failedJob.status !== "FAILED" || !failedJob.retryable) {
      throw new Error("当前搜索任务不能重试");
    }

    const lockKey = `persona-source-discovery-retry:${actorUserId}:${failedJob.id}`;
    await sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    const activeRows = await sql.unsafe<SourceDiscoveryJobRow[]>(
      `select ${selectSourceDiscoveryJobColumns}
         from persona_distill_source_discovery_jobs
        where created_by_user_id = $1::uuid
          and intent_id = $2::uuid
          and created_at > $3::timestamptz
          and status in ('QUEUED', 'CLAIMED', 'SEARCHING', 'PERSISTING')
        order by created_at asc
        limit 1`,
      [actorUserId, failedJob.intentId, failedJob.updatedAt],
    );
    if (activeRows[0]) {
      return activeRows[0].id;
    }

    const newJobId = randomUUID();
    const now = new Date().toISOString();
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
        next_run_at,
        created_at,
        updated_at
      ) values (
        ${newJobId}::uuid,
        ${failedJob.intentId}::uuid,
        ${actorUserId}::uuid,
        ${failedJob.preferredLanguage},
        ${failedJob.maxSourcesPerBucket},
        ${"QUEUED"},
        ${"准备重新搜索资料"},
        ${5},
        ${now},
        ${now},
        ${now}
      )
    `;
    return newJobId;
  });

  return newSourceDiscoveryJobId ? getDistillSourceDiscoveryJob(newSourceDiscoveryJobId, actorUserId) : null;
};

export const addDistillExtraSources = async (input: {
  discoveryId: string;
  actorUserId: string;
  extraTextSources: Array<{ title: string; content: string; sourceKind: SourceKind }>;
  extraUrlSources: Array<{ url: string; title?: string; sourceKind: SourceKind }>;
}) => {
  const discovery = await loadDiscovery(input.discoveryId, input.actorUserId);
  if (!discovery) {
    return null;
  }
  const intent = await loadIntent(discovery.intentId, input.actorUserId);
  if (!intent) {
    return null;
  }

  await withTransaction(async (sql) => {
    for (const source of input.extraTextSources) {
      const extraSourceId = randomUUID();
      const isUsable = source.content.trim().length >= 20 && !/暴力|诈骗|极端/u.test(source.content);
      const candidateId = isUsable ? randomUUID() : null;

      await sql`
        insert into persona_distill_extra_sources (
          id,
          discovery_id,
          created_by_user_id,
          input_type,
          title,
          url,
          content,
          source_kind,
          status,
          rejection_reason,
          source_candidate_id
        ) values (
          ${extraSourceId}::uuid,
          ${input.discoveryId}::uuid,
          ${input.actorUserId}::uuid,
          ${"TEXT"},
          ${source.title},
          null,
          ${source.content},
          ${source.sourceKind},
          ${isUsable ? "USABLE" : "REJECTED"},
          ${isUsable ? null : "资料过短或包含风险内容"},
          null
        )
      `;

      if (candidateId) {
        const dedupeKey = hashValue(`${input.discoveryId}:${source.title}:${source.content.slice(0, 80)}`);
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
            risk_flags,
            extra_source_id
          ) values (
            ${candidateId}::uuid,
            ${input.discoveryId}::uuid,
            ${"WRITINGS"},
            ${source.title},
            null,
            null,
            ${"用户补充"},
            null,
            null,
            ${source.content.slice(0, 240)},
            ${source.sourceKind},
            ${source.sourceKind === "PRIMARY" ? "HIGH" : "MEDIUM"},
            ${"unknown"},
            ${source.sourceKind === "PRIMARY"},
            true,
            ${"用户补充资料通过基础清洗，可用于蒸馏。"},
            ${dedupeKey},
            ${sql.json([] as JSONValue)},
            ${extraSourceId}::uuid
          )
        `;
        await sql`
          update persona_distill_extra_sources
             set source_candidate_id = ${candidateId}::uuid
           where id = ${extraSourceId}::uuid
        `;
      }
    }

    for (const source of input.extraUrlSources) {
      const extraSourceId = randomUUID();
      const candidateId = randomUUID();
      const title = source.title ?? source.url;
      await sql`
        insert into persona_distill_extra_sources (
          id,
          discovery_id,
          created_by_user_id,
          input_type,
          title,
          url,
          content,
          source_kind,
          status,
          rejection_reason,
          source_candidate_id
        ) values (
          ${extraSourceId}::uuid,
          ${input.discoveryId}::uuid,
          ${input.actorUserId}::uuid,
          ${"URL"},
          ${title},
          ${source.url},
          null,
          ${source.sourceKind},
          ${"USABLE"},
          null,
          null
        )
      `;
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
          risk_flags,
          extra_source_id
        ) values (
          ${candidateId}::uuid,
          ${input.discoveryId}::uuid,
          ${"EXTERNAL_VIEWS"},
          ${title},
          ${source.url},
          ${hashValue(source.url)},
          ${"用户补充"},
          null,
          null,
          ${`用户补充链接：${source.url}`},
          ${source.sourceKind},
          ${"MEDIUM"},
          ${"unknown"},
          ${source.sourceKind === "PRIMARY"},
          true,
          ${"用户补充链接通过基础 URL 校验，可用于蒸馏。"},
          ${hashValue(source.url)},
          ${sql.json([] as JSONValue)},
          ${extraSourceId}::uuid
        )
      `;
      await sql`
        update persona_distill_extra_sources
           set source_candidate_id = ${candidateId}::uuid
         where id = ${extraSourceId}::uuid
      `;
    }
  });

  const updatedDiscovery = await loadDiscovery(input.discoveryId, input.actorUserId);
  const response = updatedDiscovery ? await buildDiscoveryResponse(updatedDiscovery, intent) : null;
  const pendingExtraSources = (await listExtraSourcesByDiscovery(input.discoveryId)).map(mapExtraCandidate);
  return response ? { ...response, pendingExtraSources } : null;
};

export const createDistillJob = async (input: {
  intentId: string;
  discoveryId: string;
  actorUserId: string;
  selectedSourceCandidateIds: string[];
  selectedExtraSourceIds: string[];
}) => {
  await ensureUserShadow(input.actorUserId);

  const intent = await loadIntent(input.intentId, input.actorUserId);
  const discovery = await loadDiscovery(input.discoveryId, input.actorUserId);
  if (!intent || !discovery || discovery.intentId !== intent.id) {
    return null;
  }
  if (intent.riskDecision !== "ALLOW") {
    throw new Error("当前对象未通过风险判断，不能创建蒸馏任务");
  }

  const allCandidates = await listCandidatesByDiscovery(discovery.id);
  const selectedCandidateIds =
    input.selectedSourceCandidateIds.length > 0
      ? input.selectedSourceCandidateIds
      : allCandidates.filter((candidate) => candidate.recommended).slice(0, 3).map((candidate) => candidate.id);
  const selectedCandidates = allCandidates.filter(
    (candidate) =>
      selectedCandidateIds.includes(candidate.id) ||
      (candidate.extraSourceId ? input.selectedExtraSourceIds.includes(candidate.extraSourceId) : false),
  );
  const persistedSelectedCandidateIds = selectedCandidates.map((candidate) => candidate.id);
  const persistedSelectedExtraSourceIds = selectedCandidates
    .map((candidate) => candidate.extraSourceId)
    .filter((extraSourceId): extraSourceId is string => Boolean(extraSourceId && input.selectedExtraSourceIds.includes(extraSourceId)));
  const missingRequirements = buildMissingRequirements({
    selectedCandidates,
    entityType: intent.entityType,
  });
  const status: JobStatus = missingRequirements.length > 0 ? "NEEDS_MORE_SOURCES" : "QUEUED";

  const jobId = await withTransaction(async (sql) => {
    const lockKey = `persona-distill:${input.actorUserId}:${intent.id}:${discovery.id}`;
    await sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    const activeJobRows = await sql.unsafe<JobRow[]>(
      `select ${selectJobColumns}
         from persona_distill_jobs
        where created_by_user_id = $1::uuid
          and intent_id = $2::uuid
          and discovery_id = $3::uuid
          and status in ('QUEUED', 'CLAIMED', 'INGESTING', 'EXTRACTING', 'SYNTHESIZING', 'VALIDATING', 'PERSISTING')
        order by created_at asc
        limit 1`,
      [input.actorUserId, intent.id, discovery.id],
    );
    if (activeJobRows[0]) {
      return activeJobRows[0].id;
    }

    const reusablePersonaRows = await sql<{ personaId: string }[]>`
      select persona_id as "personaId"
      from persona_distill_jobs
      where created_by_user_id = ${input.actorUserId}::uuid
        and intent_id = ${intent.id}::uuid
        and discovery_id = ${discovery.id}::uuid
        and persona_id is not null
      order by
        case when status = 'SUCCEEDED' then 0 else 1 end,
        updated_at desc
      limit 1
    `;
    const personaId = reusablePersonaRows[0]?.personaId ?? randomUUID();
    const shouldCreatePersona = reusablePersonaRows.length === 0;
    const newJobId = randomUUID();
    const now = new Date().toISOString();

    await sql`
      update persona_distill_jobs
         set status = 'SUPERSEDED',
             current_step = '已由新的蒸馏任务替代',
             progress = 100,
             heartbeat_at = now(),
             updated_at = now()
       where created_by_user_id = ${input.actorUserId}::uuid
         and intent_id = ${intent.id}::uuid
         and discovery_id = ${discovery.id}::uuid
         and status in ('NEEDS_MORE_SOURCES', 'FAILED', 'BLOCKED')
    `;

    if (shouldCreatePersona) {
      await sql`
        insert into personae (
          id,
          display_name,
          origin_type,
          persona_type,
          listing_status,
          status,
          creator_user_id,
          featured_rank,
          current_draft_version_id,
          current_published_version_id,
          created_at,
          updated_at
        ) values (
          ${personaId}::uuid,
          ${intent.normalizedName},
          ${"USER"},
          ${intent.entityType === "REAL_PERSON" ? "AUTHOR_OR_BLOGGER" : "ORIGINAL_PERSONA"},
          ${"PRIVATE"},
          ${status === "QUEUED" ? "PROCESSING" : "DRAFT"},
          ${input.actorUserId}::uuid,
          null,
          null,
          null,
          ${now},
          ${now}
        )
      `;
    }

    await sql`
      insert into persona_distill_jobs (
        id,
        created_by_user_id,
        intent_id,
        discovery_id,
        persona_id,
        query,
        normalized_name,
        entity_type,
        risk_decision,
        status,
        current_step,
        progress,
        selected_source_candidate_ids,
        selected_extra_source_ids,
        missing_requirements_json,
        created_at,
        updated_at
      ) values (
        ${newJobId}::uuid,
        ${input.actorUserId}::uuid,
        ${intent.id}::uuid,
        ${discovery.id}::uuid,
        ${personaId}::uuid,
        ${intent.query},
        ${intent.normalizedName},
        ${intent.entityType},
        ${intent.riskDecision},
        ${status},
        ${status === "QUEUED" ? "排队中" : "需要补充资料"},
        ${status === "QUEUED" ? 0 : 30},
        ${sql.json(persistedSelectedCandidateIds as JSONValue)},
        ${sql.json(persistedSelectedExtraSourceIds as JSONValue)},
        ${sql.json(missingRequirements as JSONValue)},
        ${now},
        ${now}
      )
    `;
    await upsertOwnedObjectForJob(sql, {
      ownerUserId: input.actorUserId,
      personaId,
      sourceDistillJobId: newJobId,
      displayName: intent.normalizedName,
      status: objectStatusForJob(status),
      updatedAt: now,
    });
    return newJobId;
  });

  return getDistillJob(jobId, input.actorUserId);
};

const loadJob = async (jobId: string, actorUserId?: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<JobRow[]>(`select ${selectJobColumns} from persona_distill_jobs where id = $1`, [jobId]);
  const row = rows[0];
  if (!row || (actorUserId && row.createdByUserId !== actorUserId)) {
    return null;
  }
  return row;
};

const loadOwnedObjectBySourceJobId = async (sql: any, actorUserId: string, jobId: string) => {
  const rows = await sql<Array<{ id: string }>>`
    select id
      from owned_persona_objects
     where source_distill_job_id = ${jobId}::uuid
       and owner_user_id = ${actorUserId}::uuid
       and deleted_at is null
     limit 1
  `;
  return rows[0] ?? null;
};

export const getDistillJob = async (jobId: string, actorUserId: string) => {
  const job = await loadJob(jobId, actorUserId);
  if (!job) {
    return null;
  }
  const intent = await loadIntent(job.intentId, actorUserId);
  const discovery = await loadDiscovery(job.discoveryId, actorUserId);
  if (!intent || !discovery) {
    return null;
  }
  const object = await loadOwnedObjectBySourceJobId(getSql(), actorUserId, job.id);
  const pendingExtraSources = (await listExtraSourcesByDiscovery(discovery.id)).map(mapExtraCandidate);
  return {
    jobId: job.id,
    status: job.status,
    currentStep: job.currentStep,
    progress: job.progress,
    personaId: job.personaId,
    resultVersionId: job.resultVersionId,
    objectId: object?.id ?? null,
    objectHref: object ? `/profile/objects/${object.id}` : null,
    intent: mapIntent(intent),
    discovery: await buildDiscoveryResponse(discovery, intent),
    selectedSourceCandidateIds: asStringArray(job.selectedSourceCandidateIds),
    selectedExtraSourceIds: asStringArray(job.selectedExtraSourceIds),
    pendingExtraSources,
    missingRequirements: asStringArray(job.missingRequirementsJson),
    error: job.errorCode
      ? {
          code: job.errorCode,
          message: job.errorMessage ?? "蒸馏任务失败",
        }
      : null,
  };
};

const calculateDurationMs = (startedAt: Date, finishedAt: Date | null) =>
  finishedAt ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) : null;

const getTraceSummary = (value: unknown) => {
  const record = asRecord(value);
  return typeof record.summary === "string" ? record.summary : null;
};

const sanitizeTraceString = (value: string | null) =>
  value === null ? null : String(sanitizeDistillToolTraceJson(value));

const buildTraceEvent = (input: {
  kind: string;
  label: string;
  at: Date | string | null | undefined;
  seq?: number | null;
  toolName?: string | null;
  status?: string | null;
  summary?: string | null;
}) => {
  const at = toIsoString(input.at);
  if (!at) {
    return null;
  }
  return {
    kind: input.kind,
    label: input.label,
    at,
    seq: input.seq ?? null,
    toolName: input.toolName ?? null,
    status: input.status ?? null,
    summary: input.summary ?? null,
  };
};

const isTerminalJobStatus = (status: JobStatus) =>
  status === "SUCCEEDED" || status === "FAILED" || status === "NEEDS_MORE_SOURCES" || status === "BLOCKED" || status === "SUPERSEDED";

export const getDistillJobTrace = async (jobId: string, actorUserId: string) => {
  const job = await loadJob(jobId, actorUserId);
  if (!job) {
    return null;
  }

  const sql = getSql();
  const runs = await sql<ToolRunTraceRow[]>`
    select
      seq,
      tool_name as "toolName",
      runtime_state_before as "runtimeStateBefore",
      runtime_state_after as "runtimeStateAfter",
      input_json as "inputJson",
      output_json as "outputJson",
      status,
      error_message as "errorMessage",
      started_at as "startedAt",
      finished_at as "finishedAt"
    from persona_distill_tool_runs
    where job_id = ${job.id}::uuid
    order by seq asc, started_at asc
  `;
  const artifacts = await sql<ArtifactTraceRow[]>`
    select
      stage,
      artifact_json as "artifactJson",
      created_at as "createdAt"
    from persona_distill_artifacts
    where job_id = ${job.id}::uuid
    order by created_at asc
  `;

  const traceRuns = runs.map((run) => ({
    seq: run.seq,
    toolName: run.toolName,
    runtimeStateBefore: run.runtimeStateBefore,
    runtimeStateAfter: run.runtimeStateAfter,
    status: run.status,
    input: sanitizeDistillToolTraceJson(run.inputJson),
    output: sanitizeDistillToolTraceJson(run.outputJson),
    errorMessage: sanitizeTraceString(run.errorMessage),
    startedAt: toIsoString(run.startedAt)!,
    finishedAt: toIsoString(run.finishedAt),
    durationMs: calculateDurationMs(run.startedAt, run.finishedAt),
  }));
  const traceArtifacts = artifacts.map((artifact) => ({
    stage: artifact.stage,
    artifact: sanitizeDistillToolTraceJson(artifact.artifactJson),
    createdAt: toIsoString(artifact.createdAt)!,
  }));

  const events = [
    buildTraceEvent({
      kind: "persona_distill.job.created",
      label: "任务创建",
      at: job.createdAt,
      status: "CREATED",
    }),
    buildTraceEvent({
      kind: "persona_distill.job.claimed",
      label: "任务领取",
      at: job.claimedAt,
      status: "CLAIMED",
    }),
    ...runs.flatMap((run) => [
      buildTraceEvent({
        kind: "persona_distill.tool.started",
        label: `${run.toolName} 开始`,
        at: run.startedAt,
        seq: run.seq,
        toolName: run.toolName,
        status: "RUNNING",
      }),
      buildTraceEvent({
        kind:
          run.status === "REJECTED"
            ? "persona_distill.tool.rejected"
            : run.status === "FAILED"
              ? "persona_distill.tool.failed"
              : "persona_distill.tool.finished",
        label: `${run.toolName} ${run.status}`,
        at: run.finishedAt,
        seq: run.seq,
        toolName: run.toolName,
        status: run.status,
        summary: sanitizeTraceString(getTraceSummary(run.outputJson)),
      }),
    ]),
    ...artifacts.map((artifact) =>
      buildTraceEvent({
        kind: "persona_distill.artifact.created",
        label: `${artifact.stage} 已写入`,
        at: artifact.createdAt,
        status: "CREATED",
        summary: artifact.stage,
      }),
    ),
    buildTraceEvent({
      kind: "persona_distill.job.terminal",
      label: job.currentStep,
      at: isTerminalJobStatus(job.status) ? job.updatedAt : null,
      status: job.status,
      summary: sanitizeTraceString(job.errorMessage),
    }),
  ]
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

  return {
    jobId: job.id,
    status: job.status,
    currentStep: job.currentStep,
    progress: job.progress,
    events,
    runs: traceRuns,
    artifacts: traceArtifacts,
  };
};

type InventoryItem = {
  objectId: string;
  personaId: string | null;
  personaVersionId: string | null;
  sourceDistillJobId: string | null;
  displayName: string;
  intro: string | null;
  status: MyObjectStatus;
  updatedAt: string;
  primaryAction: "VIEW_PROGRESS" | "ADD_SOURCES" | "OPEN_DETAIL" | "CHAT" | "RETRY";
  primaryHref: string;
  availableActions: Array<"CHAT" | "EDIT" | "ADD_SOURCES" | "DELETE" | "CONFIRM" | "PUBLISH" | "SHARE" | "RETRY">;
};

type OwnedObjectRow = {
  id: string;
  ownerUserId: string;
  personaId: string | null;
  activePersonaVersionId: string | null;
  sourceDistillJobId: string | null;
  displayName: string;
  intro: string | null;
  status: MyObjectStatus | "DELETED";
  updatedAt: Date;
};

type ActiveOwnedObjectRow = OwnedObjectRow & { status: MyObjectStatus };

const selectOwnedObjectColumns = `
  id,
  owner_user_id as "ownerUserId",
  persona_id as "personaId",
  active_persona_version_id as "activePersonaVersionId",
  source_distill_job_id as "sourceDistillJobId",
  display_name as "displayName",
  intro,
  status,
  updated_at as "updatedAt"
`;

const objectStatusForJob = (status: JobStatus): MyObjectStatus => {
  if (status === "NEEDS_MORE_SOURCES" || status === "BLOCKED") {
    return "NEEDS_SOURCES";
  }
  if (status === "FAILED") {
    return "FAILED";
  }
  return "CREATING";
};

const upsertOwnedObjectForJob = async (
  sql: any,
  input: {
    ownerUserId: string;
    personaId: string;
    sourceDistillJobId: string;
    displayName: string;
    status: MyObjectStatus;
    intro?: string | null;
    activePersonaVersionId?: string | null;
    updatedAt?: string;
  },
) => {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const updated = await sql<{ id: string }[]>`
    update owned_persona_objects
       set source_distill_job_id = ${input.sourceDistillJobId}::uuid,
           active_persona_version_id = coalesce(${input.activePersonaVersionId ?? null}::uuid, active_persona_version_id),
           display_name = ${input.displayName},
           intro = coalesce(${input.intro ?? null}, intro),
           status = ${input.status},
           updated_at = ${updatedAt}
     where owner_user_id = ${input.ownerUserId}::uuid
       and persona_id = ${input.personaId}::uuid
       and deleted_at is null
     returning id
  `;
  if (updated[0]) {
    return updated[0].id;
  }

  const inserted = await sql<{ id: string }[]>`
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
      ${input.ownerUserId}::uuid,
      ${input.personaId}::uuid,
      ${input.activePersonaVersionId ?? null}::uuid,
      ${input.sourceDistillJobId}::uuid,
      ${input.displayName},
      ${input.intro ?? null},
      ${input.status},
      ${updatedAt},
      ${updatedAt}
    )
    returning id
  `;
  return inserted[0]?.id ?? null;
};

const buildPublishGate = (input: {
  coverageScore: number | null;
  groundingScore: number | null;
  styleScore: number | null;
  riskScore: number | null;
  evidenceSummary?: {
    sourceCount: number;
    bucketCount: number;
    primaryOrSecondaryCount: number;
    nonLowTrustCount: number;
    riskySourceCount: number;
  } | null;
}) => {
  const reasons: string[] = [];
  if ((input.coverageScore ?? 0) < distillPublishGate.coverageScoreMinimum) {
    reasons.push("资料覆盖不足");
  }
  if ((input.groundingScore ?? 0) < distillPublishGate.groundingScoreMinimum) {
    reasons.push("证据支撑不足");
  }
  if ((input.styleScore ?? 0) < distillPublishGate.styleScoreMinimum) {
    reasons.push("人物风格不稳定");
  }
  if ((input.riskScore ?? 100) > distillPublishGate.riskScoreMaximum) {
    reasons.push("风险评分过高");
  }
  if (input.evidenceSummary) {
    if (input.evidenceSummary.sourceCount < distillPublishGate.sourceCountMinimum) {
      reasons.push(`至少需要 ${distillPublishGate.sourceCountMinimum} 条可用资料`);
    }
    if (input.evidenceSummary.bucketCount < distillPublishGate.bucketCountMinimum) {
      reasons.push(`至少需要覆盖 ${distillPublishGate.bucketCountMinimum} 类证据桶`);
    }
    if (input.evidenceSummary.primaryOrSecondaryCount < distillPublishGate.primaryOrSecondaryCountMinimum) {
      reasons.push("至少需要 1 条 PRIMARY 或 SECONDARY 资料");
    }
    if (input.evidenceSummary.nonLowTrustCount < distillPublishGate.nonLowTrustCountMinimum) {
      reasons.push("至少需要 1 条中高可信资料");
    }
    if (input.evidenceSummary.riskySourceCount > 0) {
      reasons.push("存在未清除风险标记的资料");
    }
  }
  return {
    canPublishPublic: reasons.length === 0,
    canSavePrivate: true,
    reasons,
  };
};

const loadDistillEvidenceSummary = async (sourceDistillJobId: string | null) => {
  if (!sourceDistillJobId) {
    return null;
  }

  const sql = getSql();
  const rows = await sql<
    {
      bucket: EvidenceBucket;
      sourceKind: SourceKind;
      trustLevel: TrustLevel;
      riskFlags: unknown;
    }[]
  >`
    select
      c.bucket,
      c.source_kind as "sourceKind",
      c.trust_level as "trustLevel",
      c.risk_flags as "riskFlags"
    from persona_distill_jobs j
    join persona_distill_source_candidates c on c.discovery_id = j.discovery_id
    where j.id = ${sourceDistillJobId}::uuid
      and (
        c.id::text in (select jsonb_array_elements_text(j.selected_source_candidate_ids))
        or (
          c.extra_source_id is not null
          and c.extra_source_id::text in (select jsonb_array_elements_text(j.selected_extra_source_ids))
        )
      )
  `;
  const usableRows = rows.filter((row) => asStringArray(row.riskFlags).length === 0);

  return {
    sourceCount: usableRows.length,
    bucketCount: new Set(usableRows.map((row) => row.bucket)).size,
    primaryOrSecondaryCount: usableRows.filter((row) => row.sourceKind === "PRIMARY" || row.sourceKind === "SECONDARY").length,
    nonLowTrustCount: usableRows.filter((row) => row.trustLevel !== "LOW").length,
    riskySourceCount: rows.length - usableRows.length,
  };
};

export const listPersonaInventory = async (actorUserId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<OwnedObjectRow[]>(
    `select ${selectOwnedObjectColumns}
       from owned_persona_objects
      where owner_user_id = $1::uuid
        and deleted_at is null
      order by updated_at desc`,
    [actorUserId],
  );
  const items: InventoryItem[] = rows
    .filter((row): row is ActiveOwnedObjectRow => row.status !== "DELETED")
    .map((row) => {
      const addSourcesHref = row.sourceDistillJobId ? `/create?jobId=${row.sourceDistillJobId}&mode=addSources` : "/create";
      const progressHref = row.sourceDistillJobId ? `/create?jobId=${row.sourceDistillJobId}` : "/create";
      const previewHref = row.activePersonaVersionId ? `/preview/${row.activePersonaVersionId}` : progressHref;
      const chatHref = row.status === "PUBLIC" && row.personaId ? `/persona/${row.personaId}` : previewHref;
      const actionByStatus: Record<MyObjectStatus, InventoryItem["primaryAction"]> = {
        CREATING: "VIEW_PROGRESS",
        NEEDS_SOURCES: "ADD_SOURCES",
        FAILED: "RETRY",
        PENDING_CONFIRM: "OPEN_DETAIL",
        READY: "CHAT",
        PUBLIC: "CHAT",
      };
      const hrefByStatus: Record<MyObjectStatus, string> = {
        CREATING: progressHref,
        NEEDS_SOURCES: addSourcesHref,
        FAILED: addSourcesHref,
        PENDING_CONFIRM: previewHref,
        READY: previewHref,
        PUBLIC: chatHref,
      };
      const actionsByStatus: Record<MyObjectStatus, InventoryItem["availableActions"]> = {
        CREATING: [],
        NEEDS_SOURCES: ["ADD_SOURCES"],
        FAILED: ["RETRY", "ADD_SOURCES"],
        PENDING_CONFIRM: ["CONFIRM", "ADD_SOURCES", "DELETE"],
        READY: ["CHAT", "EDIT", "ADD_SOURCES"],
        PUBLIC: ["CHAT", "EDIT", "ADD_SOURCES", "SHARE"],
      };

      return {
        objectId: row.id,
        personaId: row.personaId,
        personaVersionId: row.activePersonaVersionId,
        sourceDistillJobId: row.sourceDistillJobId,
        displayName: row.displayName,
        intro: row.intro,
        status: row.status,
        updatedAt: toIsoString(row.updatedAt)!,
        primaryAction: actionByStatus[row.status],
        primaryHref: hrefByStatus[row.status],
        availableActions: actionsByStatus[row.status],
      };
    });

  return {
    groups: {
      creating: items.filter((item) => item.status === "CREATING"),
      needsAttention: items.filter((item) => item.status === "NEEDS_SOURCES" || item.status === "FAILED" || item.status === "PENDING_CONFIRM"),
      ready: items.filter((item) => item.status === "READY"),
      public: items.filter((item) => item.status === "PUBLIC"),
    },
    items,
  };
};

type OwnedObjectDetailRow = ActiveOwnedObjectRow & {
  shareSlug: string | null;
};

type MyObjectDetail = {
  objectId: string;
  displayName: string;
  intro: string | null;
  status: MyObjectStatus;
  updatedAt: string;
  primaryAction: InventoryItem["primaryAction"];
  primaryHref: string;
  availableActions: InventoryItem["availableActions"];
  chatHref: string | null;
  addSourcesHref: string | null;
  shareHref: string | null;
  editableFields: Array<"displayName" | "intro">;
  userMessage: string | null;
};

type MyObjectActionResponse = {
  object: MyObjectDetail;
  share: {
    shareHref: string;
    canonicalUrl: string;
    miniappPath: string;
  } | null;
  message: string;
};

export class OwnedObjectActionError extends Error {
  readonly statusCode: number;
  readonly object: MyObjectDetail | null;

  constructor(message: string, statusCode: number, object: MyObjectDetail | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.object = object;
  }
}

const loadOwnedObjectDetailRow = async (sql: any, actorUserId: string, objectId: string) => {
  const rows = await sql<
    OwnedObjectDetailRow[]
  >`
    select
      o.id,
      o.owner_user_id as "ownerUserId",
      o.persona_id as "personaId",
      o.active_persona_version_id as "activePersonaVersionId",
      o.source_distill_job_id as "sourceDistillJobId",
      o.display_name as "displayName",
      o.intro,
      o.status,
      o.updated_at as "updatedAt",
      s.share_slug as "shareSlug"
    from owned_persona_objects o
    left join share_links s on s.persona_version_id = o.active_persona_version_id
      and s.is_primary = true
      and s.is_active = true
    where o.id = ${objectId}::uuid
      and o.owner_user_id = ${actorUserId}::uuid
      and o.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
};

const buildMyObjectDetail = (row: OwnedObjectDetailRow): MyObjectDetail => {
  const addSourcesHref = row.sourceDistillJobId ? `/create?jobId=${row.sourceDistillJobId}&mode=addSources` : null;
  const progressHref = row.sourceDistillJobId ? `/create?jobId=${row.sourceDistillJobId}` : "/create";
  const objectDetailHref = `/profile/objects/${row.id}`;
  const objectChatHref = row.activePersonaVersionId && (row.status === "READY" || row.status === "PUBLIC")
    ? `/profile/objects/${row.id}/chat`
    : null;
  const shareHref = row.shareSlug ? `/share/${row.shareSlug}` : null;

  const primaryActionByStatus: Record<MyObjectStatus, MyObjectDetail["primaryAction"]> = {
    CREATING: "VIEW_PROGRESS",
    NEEDS_SOURCES: "ADD_SOURCES",
    FAILED: "RETRY",
    PENDING_CONFIRM: "OPEN_DETAIL",
    READY: "CHAT",
    PUBLIC: "CHAT",
  };
  const primaryHrefByStatus: Record<MyObjectStatus, string> = {
    CREATING: progressHref,
    NEEDS_SOURCES: addSourcesHref ?? "/create",
    FAILED: addSourcesHref ?? "/create",
    PENDING_CONFIRM: objectDetailHref,
    READY: objectChatHref ?? objectDetailHref,
    PUBLIC: objectChatHref ?? shareHref ?? objectDetailHref,
  };
  const actionsByStatus: Record<MyObjectStatus, MyObjectDetail["availableActions"]> = {
    CREATING: [],
    NEEDS_SOURCES: ["ADD_SOURCES", "DELETE"],
    FAILED: ["RETRY", "ADD_SOURCES", "DELETE"],
    PENDING_CONFIRM: ["CONFIRM", "ADD_SOURCES", "DELETE"],
    READY: ["CHAT", "EDIT", "ADD_SOURCES", "PUBLISH", "DELETE"],
    PUBLIC: ["CHAT", "EDIT", "ADD_SOURCES", "SHARE", "DELETE"],
  };
  const messageByStatus: Record<MyObjectStatus, string> = {
    CREATING: "正在生成。",
    NEEDS_SOURCES: "需要补充资料。",
    FAILED: "生成失败，可以补资料后重试。",
    PENDING_CONFIRM: "先确认是否保存。",
    READY: "已保存到我的对象。",
    PUBLIC: "已公开分享。",
  };
  const editableFields: MyObjectDetail["editableFields"] =
    row.status === "CREATING" ? [] : ["displayName", "intro"];

  return {
    objectId: row.id,
    displayName: row.displayName,
    intro: row.intro,
    status: row.status,
    updatedAt: toIsoString(row.updatedAt)!,
    primaryAction: primaryActionByStatus[row.status],
    primaryHref: primaryHrefByStatus[row.status],
    availableActions: actionsByStatus[row.status],
    chatHref: objectChatHref,
    addSourcesHref,
    shareHref,
    editableFields,
    userMessage: messageByStatus[row.status],
  };
};

export const getOwnedPersonaObjectDetail = async (actorUserId: string, objectId: string) => {
  const row = await loadOwnedObjectDetailRow(getSql(), actorUserId, objectId);
  return row ? buildMyObjectDetail(row) : null;
};

export const getOwnedPersonaObjectChatTarget = async (actorUserId: string, objectId: string) => {
  const row = await loadOwnedObjectDetailRow(getSql(), actorUserId, objectId);
  if (!row) {
    return null;
  }
  if ((row.status !== "READY" && row.status !== "PUBLIC") || !row.activePersonaVersionId) {
    throw new OwnedObjectActionError("对象还不能聊天。", 400, buildMyObjectDetail(row));
  }

  return {
    personaId: row.personaId,
    personaVersionId: row.activePersonaVersionId,
  };
};

export const updateOwnedPersonaObject = async (
  actorUserId: string,
  objectId: string,
  input: {
    displayName?: string;
    intro?: string | null;
  },
) =>
  withTransaction(async (sql) => {
    const row = await loadOwnedObjectDetailRow(sql, actorUserId, objectId);
    if (!row) {
      return null;
    }
    if (row.status === "CREATING") {
      throw new OwnedObjectActionError("对象还在生成，完成后再编辑。", 400, buildMyObjectDetail(row));
    }

    const displayName = input.displayName ?? row.displayName;
    const intro = input.intro === undefined ? row.intro : input.intro;
    await sql`
      update owned_persona_objects
         set display_name = ${displayName},
             intro = ${intro},
             updated_at = now()
       where id = ${objectId}::uuid
         and owner_user_id = ${actorUserId}::uuid
         and deleted_at is null
    `;

    if (row.personaId && input.displayName !== undefined) {
      await sql`
        update personae
           set display_name = ${displayName},
               updated_at = now()
         where id = ${row.personaId}::uuid
           and creator_user_id = ${actorUserId}::uuid
      `;
    }

    const updated = await loadOwnedObjectDetailRow(sql, actorUserId, objectId);
    return {
      object: buildMyObjectDetail(updated!),
      share: null,
      message: "已更新。",
    } satisfies MyObjectActionResponse;
  });

export const confirmOwnedPersonaObject = async (actorUserId: string, objectId: string) => {
  const row = await loadOwnedObjectDetailRow(getSql(), actorUserId, objectId);
  if (!row) {
    return null;
  }
  if (row.status !== "PENDING_CONFIRM" || !row.activePersonaVersionId) {
    throw new OwnedObjectActionError("当前对象还不能确认使用。", 400, buildMyObjectDetail(row));
  }

  await publishDynamicPersonaVersion({
    versionId: row.activePersonaVersionId,
    visibility: "PRIVATE",
  });
  const object = await getOwnedPersonaObjectDetail(actorUserId, objectId);
  return {
    object: object!,
    share: null,
    message: "已保存到我的对象。",
  } satisfies MyObjectActionResponse;
};

export const publishOwnedPersonaObject = async (actorUserId: string, objectId: string) => {
  const row = await loadOwnedObjectDetailRow(getSql(), actorUserId, objectId);
  if (!row) {
    return null;
  }
  if ((row.status !== "PENDING_CONFIRM" && row.status !== "READY" && row.status !== "PUBLIC") || !row.activePersonaVersionId) {
    throw new OwnedObjectActionError("当前对象还不能公开。", 400, buildMyObjectDetail(row));
  }

  const presentation = await getPersonaVersionPresentation(row.activePersonaVersionId, actorUserId);
  if (row.sourceDistillJobId && !presentation?.publishGate.canPublishPublic) {
    throw new OwnedObjectActionError("暂时不能公开，可以先自己使用或补充资料。", 400, buildMyObjectDetail(row));
  }

  const result = await publishDynamicPersonaVersion({
    versionId: row.activePersonaVersionId,
    visibility: "PUBLIC",
  });
  if (!result) {
    throw new OwnedObjectActionError("当前对象还不能公开。", 400, buildMyObjectDetail(row));
  }

  const object = await getOwnedPersonaObjectDetail(actorUserId, objectId);
  return {
    object: object!,
    share: result.share
      ? {
          shareHref: `/share/${result.share.shareSlug}`,
          canonicalUrl: result.share.canonicalUrl,
          miniappPath: result.share.miniappPath,
        }
      : null,
    message: "已公开分享。",
  } satisfies MyObjectActionResponse;
};

export const deleteOwnedPersonaObject = async (actorUserId: string, objectId: string) =>
  withTransaction(async (sql) => {
    const row = await loadOwnedObjectDetailRow(sql, actorUserId, objectId);
    if (!row) {
      return null;
    }
    if (row.status === "CREATING") {
      throw new OwnedObjectActionError("对象还在生成，完成后再删除。", 400, buildMyObjectDetail(row));
    }

    await sql`
      update owned_persona_objects
         set status = 'DELETED',
             deleted_at = now(),
             updated_at = now()
       where id = ${objectId}::uuid
         and owner_user_id = ${actorUserId}::uuid
         and deleted_at is null
    `;

    if (row.activePersonaVersionId) {
      await sql`
        update persona_versions v
           set status = 'REJECTED'
          from personae p
         where v.id = ${row.activePersonaVersionId}::uuid
           and p.id = v.persona_id
           and p.creator_user_id = ${actorUserId}::uuid
           and v.status = 'CANDIDATE'
           and p.current_draft_version_id is distinct from v.id
           and p.current_published_version_id is distinct from v.id
      `;
    }

    return {
      objectId,
      deleted: true as const,
      message: "已删除。",
    };
  });

export const getPersonaVersionPresentation = async (
  versionId: string,
  actorUserId: string | null,
  actorRole: "ANONYMOUS" | "USER" | "REVIEWER" | null = null,
) => {
  const sql = getSql();
  const rows = await sql<
    {
      personaId: string;
      creatorUserId: string | null;
      currentDraftVersionId: string | null;
      currentPublishedVersionId: string | null;
      versionStatus: string;
      coverageScore: number | null;
      groundingScore: number | null;
      styleScore: number | null;
      riskScore: number | null;
      sourceDistillJobId: string | null;
      shareSlug: string | null;
    }[]
  >`
    select
      p.id as "personaId",
      p.creator_user_id as "creatorUserId",
      p.current_draft_version_id as "currentDraftVersionId",
      p.current_published_version_id as "currentPublishedVersionId",
      v.status as "versionStatus",
      v.coverage_score as "coverageScore",
      v.grounding_score as "groundingScore",
      v.style_score as "styleScore",
      v.risk_score as "riskScore",
      v.source_distill_job_id as "sourceDistillJobId",
      s.share_slug as "shareSlug"
    from persona_versions v
    join personae p on p.id = v.persona_id
    left join share_links s on s.persona_version_id = v.id and s.is_primary = true and s.is_active = true
    where v.id = ${versionId}::uuid
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  const ownerDisplayStatus =
    row.currentPublishedVersionId === versionId || row.shareSlug
      ? "PUBLIC"
      : row.currentDraftVersionId === versionId
        ? "PRIVATE"
        : row.versionStatus === "CANDIDATE" && row.creatorUserId === actorUserId
          ? "CANDIDATE"
          : null;
  const evidenceSummary = await loadDistillEvidenceSummary(row.sourceDistillJobId);
  const gate = buildPublishGate({ ...row, evidenceSummary });
  const canSeeOwnerFields = actorRole === "REVIEWER" || Boolean(actorUserId && row.creatorUserId === actorUserId);
  return {
    publishGate: gate,
    sourceDistillJobId: canSeeOwnerFields ? row.sourceDistillJobId : null,
    ownerDisplayStatus,
    personaHref: ownerDisplayStatus === "PUBLIC" ? `/persona/${row.personaId}` : `/preview/${versionId}`,
    shareHref: row.shareSlug ? `/share/${row.shareSlug}` : null,
    addSourcesHref: canSeeOwnerFields && row.sourceDistillJobId ? `/create?jobId=${row.sourceDistillJobId}&mode=addSources` : null,
  };
};

export const discardPersonaVersion = async (versionId: string, actorUserId: string) => {
  return withTransaction(async (sql) => {
    const rows = await sql<
      {
        versionId: string;
        personaId: string;
        currentDraftVersionId: string | null;
        currentPublishedVersionId: string | null;
      }[]
    >`
      update persona_versions v
         set status = 'REJECTED'
        from personae p
       where v.id = ${versionId}::uuid
         and p.id = v.persona_id
         and p.creator_user_id = ${actorUserId}::uuid
         and v.status = 'CANDIDATE'
         and p.current_draft_version_id is distinct from v.id
         and p.current_published_version_id is distinct from v.id
      returning
        v.id as "versionId",
        p.id as "personaId",
        p.current_draft_version_id as "currentDraftVersionId",
        p.current_published_version_id as "currentPublishedVersionId"
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }

    if (row.currentPublishedVersionId) {
      await sql`
        update owned_persona_objects
           set active_persona_version_id = ${row.currentPublishedVersionId}::uuid,
               status = 'PUBLIC',
               updated_at = now()
         where owner_user_id = ${actorUserId}::uuid
           and persona_id = ${row.personaId}::uuid
           and active_persona_version_id = ${versionId}::uuid
           and deleted_at is null
      `;
    } else if (row.currentDraftVersionId) {
      await sql`
        update owned_persona_objects
           set active_persona_version_id = ${row.currentDraftVersionId}::uuid,
               status = 'READY',
               updated_at = now()
         where owner_user_id = ${actorUserId}::uuid
           and persona_id = ${row.personaId}::uuid
           and active_persona_version_id = ${versionId}::uuid
           and deleted_at is null
      `;
    } else {
      await sql`
        update owned_persona_objects
           set status = 'DELETED',
               deleted_at = now(),
               updated_at = now()
         where owner_user_id = ${actorUserId}::uuid
           and persona_id = ${row.personaId}::uuid
           and active_persona_version_id = ${versionId}::uuid
           and deleted_at is null
      `;
    }

    return { personaVersionId: row.versionId, status: "REJECTED" as const };
  });
};

export const __internal = {
  shouldUseKimiDiscovery,
  shouldAllowSyntheticDiscovery,
};
