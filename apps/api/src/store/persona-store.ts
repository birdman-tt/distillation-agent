import { randomUUID } from "node:crypto";

import { defaultPublishQualityGate } from "@hall-of-fame/domain";

import {
  findPersonaSeedByPersonaId,
  findPersonaSeedByShareSlug,
  findPersonaSeedByVersionId,
  listFeaturedPersonae,
} from "../seed/official-personae.js";
import { hashNormalizedUrl, normalizeUrl } from "../utils/url-safety.js";

type PersonaRecord = {
  id: string;
  displayName: string;
  originType: "OFFICIAL" | "USER";
  personaType: "HISTORICAL_FIGURE" | "AUTHOR_OR_BLOGGER" | "ORIGINAL_PERSONA";
  listingStatus: "PRIVATE" | "UNLISTED" | "FEATURED" | "REMOVED";
  status: "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "REJECTED";
  creatorUserId: string | null;
  featuredRank: number | null;
  currentDraftVersionId: string | null;
  currentPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PersonaVersionRecord = {
  id: string;
  personaId: string;
  versionNumber: number;
  status: "DRAFT" | "CANDIDATE" | "PENDING_PUBLISH_REVIEW" | "PUBLISHED" | "SUPERSEDED" | "REJECTED";
  profileJson: Record<string, unknown>;
  distillFocus: string[];
  previewIntro: string | null;
  recommendedQuestions: string[];
  sampleAnswers: string[];
  coverageScore: number | null;
  groundingScore: number | null;
  styleScore: number | null;
  riskScore: number | null;
  createdByUserId: string | null;
  submittedForPublishAt: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
};

type SourceRecord = {
  id: string;
  personaId: string;
  inputType: "TEXT" | "URL" | "OFFICIAL_SEED";
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceSummary: string | null;
  sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  sourcePublishedAt: string | null;
  submittedByUserId: string | null;
  normalizedUrl: string | null;
  normalizedUrlHash: string | null;
  trustScore: number | null;
  reviewReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type SourceDocumentRecord = {
  id: string;
  sourceId: string;
  title: string | null;
  author: string | null;
  url: string | null;
  normalizedText: string;
  contentHash: string;
  fetchStatusCode: number | null;
  fetchError: string | null;
  fetchedAt: string | null;
  createdAt: string;
};

type EvidenceSpanRecord = {
  id: string;
  documentId: string;
  sectionLabel: string | null;
  spanStart: number;
  spanEnd: number;
  normalizedQuote: string;
  sourceKind: "PRIMARY" | "SECONDARY" | "SUMMARY";
  trustScore: number | null;
  dedupeGroupId: string | null;
  conflictGroupId: string | null;
  createdAt: string;
};

type ShareLinkRecord = {
  id: string;
  personaVersionId: string;
  shareSlug: string;
  canonicalUrl: string;
  miniappPath: string;
  channelHint: "H5" | "WECHAT_IN_APP" | "WECHAT_SHARE_CARD";
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
};

type PublishReviewRecord = {
  id: string;
  personaVersionId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  createdAt: string;
};

type SourceReviewRecord = {
  id: string;
  sourceId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  createdAt: string;
};

type FeedbackRecord = {
  id: string;
  personaId: string;
  personaVersionId: string;
  chatMessageId: string | null;
  feedbackKind: string;
  feedbackValue: string;
  createdByUserId: string | null;
  createdAt: string;
};

const dynamicPersonae = new Map<string, PersonaRecord>();
const dynamicVersions = new Map<string, PersonaVersionRecord>();
const sources = new Map<string, SourceRecord>();
const sourceDocuments = new Map<string, SourceDocumentRecord>();
const evidenceSpans = new Map<string, EvidenceSpanRecord>();
const shares = new Map<string, ShareLinkRecord>();
const sourceReviews: SourceReviewRecord[] = [];
const publishReviews: PublishReviewRecord[] = [];
const feedbackItems: FeedbackRecord[] = [];

const nowIso = () => new Date().toISOString();

const baseUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

const createCanonicalUrl = (shareSlug: string) => `${baseUrl()}/share/${shareSlug}`;
const createMiniappPath = (shareSlug: string) => `/pages/share/index?slug=${encodeURIComponent(shareSlug)}`;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "persona";

const getDynamicPersona = (personaId: string) => dynamicPersonae.get(personaId) ?? null;
const getDynamicVersion = (versionId: string) => dynamicVersions.get(versionId) ?? null;

const getPersonaName = (personaId: string) =>
  getDynamicPersona(personaId)?.displayName ?? findPersonaSeedByPersonaId(personaId)?.persona.displayName ?? "Unknown Persona";

const getVersionByPersona = (personaId: string) =>
  [...dynamicVersions.values()]
    .filter((item) => item.personaId === personaId)
    .sort((a, b) => a.versionNumber - b.versionNumber);

const deleteSourceDocuments = (sourceId: string) => {
  const documentIds = [...sourceDocuments.values()].filter((item) => item.sourceId === sourceId).map((item) => item.id);
  for (const documentId of documentIds) {
    sourceDocuments.delete(documentId);
    for (const [spanId, span] of evidenceSpans.entries()) {
      if (span.documentId === documentId) {
        evidenceSpans.delete(spanId);
      }
    }
  }
};

const buildUniqueShareSlug = (base: string, personaId: string, versionNumber: number) => {
  const personaSuffix = personaId.slice(0, 8).toLowerCase();
  const candidateBase = `${base}-${personaSuffix}-v${versionNumber}`;
  let candidate = candidateBase;
  let counter = 1;

  while ([...shares.values()].some((item) => item.shareSlug === candidate)) {
    counter += 1;
    candidate = `${candidateBase}-${counter}`;
  }

  return candidate;
};

const createSourceDocument = (source: SourceRecord, normalizedText: string, url: string | null) => {
  const documentId = randomUUID();
  const createdAt = nowIso();
  const document: SourceDocumentRecord = {
    id: documentId,
    sourceId: source.id,
    title: source.sourceTitle,
    author: source.sourceAuthor,
    url,
    normalizedText,
    contentHash: `${source.id}:${normalizedText.length}`,
    fetchStatusCode: url ? 202 : null,
    fetchError: null,
    fetchedAt: createdAt,
    createdAt,
  };
  sourceDocuments.set(document.id, document);

  const quote = normalizedText.slice(0, 240);
  const span: EvidenceSpanRecord = {
    id: randomUUID(),
    documentId: document.id,
    sectionLabel: "body",
    spanStart: 0,
    spanEnd: quote.length,
    normalizedQuote: quote,
    sourceKind: source.sourceKind,
    trustScore: source.trustScore,
    dedupeGroupId: null,
    conflictGroupId: null,
    createdAt,
  };
  evidenceSpans.set(span.id, span);

  return { document, span };
};

export const listFeaturedHall = () =>
  listFeaturedPersonae().map((seed) => ({
    ...seed.persona,
    currentPublishedVersionId: seed.version.id,
    previewIntro: seed.version.previewIntro,
    recommendedQuestions: seed.version.recommendedQuestions,
  }));

export const getPersonaDetail = (personaId: string) => {
  const seed = findPersonaSeedByPersonaId(personaId);
  if (seed) {
    return {
      persona: {
        ...seed.persona,
        currentPublishedVersionId: seed.version.id,
      },
      version: {
        ...seed.version,
        coverageScore: 85,
        groundingScore: 85,
        styleScore: 80,
        riskScore: 10,
      },
    };
  }

  const persona = getDynamicPersona(personaId);
  if (!persona) {
    return null;
  }

  const versionId = persona.currentPublishedVersionId ?? persona.currentDraftVersionId;
  const version = versionId ? getDynamicVersion(versionId) : null;
  if (!version) {
    return null;
  }

  return {
    persona: {
      id: persona.id,
      displayName: persona.displayName,
      originType: persona.originType,
      personaType: persona.personaType,
      listingStatus: persona.listingStatus,
      status: persona.status,
      featuredRank: persona.featuredRank,
      currentPublishedVersionId: version.id,
    },
    version,
  };
};

export const createPersona = (input: {
  displayName: string;
  personaType: PersonaRecord["personaType"];
  originType: PersonaRecord["originType"];
  distillFocus: string[];
  creatorUserId: string;
}) => {
  const createdAt = nowIso();
  const versionId = randomUUID();
  const personaId = randomUUID();

  const persona: PersonaRecord = {
    id: personaId,
    displayName: input.displayName,
    originType: input.originType,
    personaType: input.personaType,
    listingStatus: "PRIVATE",
    status: "DRAFT",
    creatorUserId: input.creatorUserId,
    featuredRank: null,
    currentDraftVersionId: versionId,
    currentPublishedVersionId: null,
    createdAt,
    updatedAt: createdAt,
  };

  const version: PersonaVersionRecord = {
    id: versionId,
    personaId,
    versionNumber: 1,
    status: "DRAFT",
    profileJson: {
      summary: `${input.displayName} 的草稿蒸馏对象`,
      topicStrengths: input.distillFocus,
    },
    distillFocus: input.distillFocus,
    previewIntro: null,
    recommendedQuestions: [],
    sampleAnswers: [],
    coverageScore: null,
    groundingScore: null,
    styleScore: null,
    riskScore: null,
    createdByUserId: input.creatorUserId,
    submittedForPublishAt: null,
    publishedAt: null,
    supersededAt: null,
    createdAt,
  };

  dynamicPersonae.set(persona.id, persona);
  dynamicVersions.set(version.id, version);

  return { persona, version };
};

export const updatePersona = (personaId: string, input: Partial<Pick<PersonaRecord, "displayName" | "listingStatus" | "status">>) => {
  const persona = getDynamicPersona(personaId);
  if (!persona) {
    return null;
  }

  if (input.displayName !== undefined) {
    persona.displayName = input.displayName;
  }
  if (input.listingStatus !== undefined) {
    persona.listingStatus = input.listingStatus;
  }
  if (input.status !== undefined) {
    persona.status = input.status;
  }
  persona.updatedAt = nowIso();
  return persona;
};

export const getPersonaStatus = (personaId: string) => {
  const dynamicPersona = getDynamicPersona(personaId);
  if (dynamicPersona) {
    return {
      personaId: dynamicPersona.id,
      status: dynamicPersona.status,
      currentDraftVersionId: dynamicPersona.currentDraftVersionId,
      currentPublishedVersionId: dynamicPersona.currentPublishedVersionId,
    };
  }

  const detail = getPersonaDetail(personaId);
  if (!detail) {
    return null;
  }

  return {
    personaId: detail.persona.id,
    status: detail.persona.status,
    currentDraftVersionId: null,
    currentPublishedVersionId: detail.persona.currentPublishedVersionId,
  };
};

export const listPersonaVersions = (personaId: string) => {
  const seed = findPersonaSeedByPersonaId(personaId);
  if (seed) {
    return [
      {
        ...seed.version,
        personaId: seed.persona.id,
        status: "PUBLISHED",
        coverageScore: 85,
        groundingScore: 85,
        styleScore: 80,
        riskScore: 10,
      },
    ];
  }

  return getVersionByPersona(personaId);
};

export const getPersonaVersion = (versionId: string) => {
  const seed = findPersonaSeedByVersionId(versionId);
  if (seed) {
    return {
      ...seed.version,
      personaId: seed.persona.id,
      status: "PUBLISHED",
      coverageScore: 85,
      groundingScore: 85,
      styleScore: 80,
      riskScore: 10,
    };
  }

  return getDynamicVersion(versionId);
};

export const canManagePersona = (personaId: string, actorUserId: string, actorRole: "ANONYMOUS" | "USER" | "REVIEWER") => {
  if (actorRole === "REVIEWER") {
    return true;
  }

  const persona = getDynamicPersona(personaId);
  return Boolean(persona && persona.creatorUserId === actorUserId);
};

export const canAccessPersonaVersion = (
  versionId: string,
  actorUserId: string | null,
  actorRole: "ANONYMOUS" | "USER" | "REVIEWER" | null,
) => {
  const officialSeed = findPersonaSeedByVersionId(versionId);
  if (officialSeed) {
    return true;
  }

  const version = getDynamicVersion(versionId);
  if (!version) {
    return false;
  }

  if (version.status === "PUBLISHED") {
    return true;
  }

  if (actorRole === "REVIEWER") {
    return true;
  }

  const persona = getDynamicPersona(version.personaId);
  return Boolean(actorUserId && persona?.creatorUserId === actorUserId);
};

export const transferPersonaOwnership = (fromUserId: string, toUserId: string) => {
  if (fromUserId === toUserId) {
    return;
  }

  for (const persona of dynamicPersonae.values()) {
    if (persona.creatorUserId === fromUserId) {
      persona.creatorUserId = toUserId;
      persona.updatedAt = nowIso();
    }
  }

  for (const version of dynamicVersions.values()) {
    if (version.createdByUserId === fromUserId) {
      version.createdByUserId = toUserId;
    }
  }

  for (const source of sources.values()) {
    if (source.submittedByUserId === fromUserId) {
      source.submittedByUserId = toUserId;
    }
  }

  for (const item of feedbackItems) {
    if (item.createdByUserId === fromUserId) {
      item.createdByUserId = toUserId;
    }
  }
};

export const createTextSource = (personaId: string, input: {
  content: string;
  title?: string;
  author?: string;
  sourceKind: SourceRecord["sourceKind"];
  submittedByUserId: string;
}) => {
  if (!getDynamicPersona(personaId)) {
    return null;
  }

  const createdAt = nowIso();
  const source: SourceRecord = {
    id: randomUUID(),
    personaId,
    inputType: "TEXT",
    reviewStatus: "PENDING_REVIEW",
    sourceUrl: null,
    sourceTitle: input.title ?? null,
    sourceAuthor: input.author ?? null,
    sourceSummary: input.content.slice(0, 160),
    sourceKind: input.sourceKind,
    sourcePublishedAt: null,
    submittedByUserId: input.submittedByUserId,
    normalizedUrl: null,
    normalizedUrlHash: null,
    trustScore: input.sourceKind === "PRIMARY" ? 90 : input.sourceKind === "SECONDARY" ? 75 : 60,
    reviewReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt,
  };

  sources.set(source.id, source);
  createSourceDocument(source, input.content.trim(), null);
  return source;
};

export const createUrlSource = (personaId: string, input: {
  url: string;
  title?: string;
  author?: string;
  sourceKind: SourceRecord["sourceKind"];
  submittedByUserId: string;
}) => {
  if (!getDynamicPersona(personaId)) {
    return null;
  }

  const normalizedUrl = normalizeUrl(input.url);
  const normalizedUrlHash = hashNormalizedUrl(normalizedUrl);
  const createdAt = nowIso();
  const source: SourceRecord = {
    id: randomUUID(),
    personaId,
    inputType: "URL",
    reviewStatus: "PENDING_REVIEW",
    sourceUrl: normalizedUrl,
    sourceTitle: input.title ?? null,
    sourceAuthor: input.author ?? null,
    sourceSummary: `Imported from ${new URL(normalizedUrl).hostname}`,
    sourceKind: input.sourceKind,
    sourcePublishedAt: null,
    submittedByUserId: input.submittedByUserId,
    normalizedUrl,
    normalizedUrlHash,
    trustScore: input.sourceKind === "PRIMARY" ? 85 : input.sourceKind === "SECONDARY" ? 70 : 55,
    reviewReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt,
  };

  sources.set(source.id, source);
  return source;
};

export const persistUrlSourceIngestResult = (sourceId: string, input: {
  normalizedUrl: string;
  normalizedUrlHash: string;
  snapshot: {
    title: string;
    author: string | null;
    normalizedText: string;
  };
}) => {
  const source = sources.get(sourceId);
  if (!source) {
    return null;
  }

  source.normalizedUrl = input.normalizedUrl;
  source.normalizedUrlHash = input.normalizedUrlHash;
  source.sourceUrl = input.normalizedUrl;
  source.sourceTitle = input.snapshot.title;
  source.sourceAuthor = input.snapshot.author;
  source.sourceSummary = input.snapshot.normalizedText.slice(0, 160);

  deleteSourceDocuments(sourceId);
  createSourceDocument(source, input.snapshot.normalizedText.trim(), input.normalizedUrl);
  return source;
};

export const listPersonaSources = (personaId: string) =>
  [...sources.values()]
    .filter((item) => item.personaId === personaId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const listApprovedSourceEvidence = (personaId: string) =>
  listPersonaSources(personaId)
    .filter((item) => item.reviewStatus === "APPROVED")
    .map((item) => ({
      sourceId: item.id,
      title: item.sourceTitle,
      snippet: item.sourceSummary ?? "已审核资料摘要",
    }));

export const listPendingSourceReviews = () =>
  [...sources.values()]
    .filter((item) => item.reviewStatus === "PENDING_REVIEW")
    .map((item) => ({
      sourceId: item.id,
      personaId: item.personaId,
      displayName: getPersonaName(item.personaId),
      sourceTitle: item.sourceTitle,
      sourceSummary: item.sourceSummary,
      sourceKind: item.sourceKind,
      reviewStatus: item.reviewStatus,
      createdAt: item.createdAt,
    }));

export const reviewSource = (sourceId: string, input: {
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
}) => {
  const source = sources.get(sourceId);
  if (!source) {
    return null;
  }

  source.reviewStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  source.reviewReason = input.reason;
  source.reviewedByUserId = input.reviewerUserId;
  source.reviewedAt = nowIso();

  sourceReviews.push({
    id: randomUUID(),
    sourceId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    reason: input.reason,
    createdAt: source.reviewedAt,
  });

  return source;
};

const buildDistilledQuestions = (displayName: string, focus: string[]) => {
  const primaryFocus = focus[0] ?? "观点";
  return [
    `如果从 ${primaryFocus} 来看，${displayName} 会怎么回答？`,
    `${displayName} 最在意的问题会是什么？`,
    `站在 ${displayName} 的角度，应该先做什么？`,
  ];
};

export const prepareDistillInput = (personaId: string) => {
  const persona = getDynamicPersona(personaId);
  if (!persona) {
    return null;
  }

  const approvedSources = listPersonaSources(personaId).filter((item) => item.reviewStatus === "APPROVED");
  if (approvedSources.length === 0) {
    throw new Error("At least one approved source is required before distill");
  }

  const sourceKindCounts = approvedSources.reduce(
    (acc, source) => {
      if (source.sourceKind === "PRIMARY" || source.sourceKind === "SECONDARY") {
        acc.primaryOrSecondary += 1;
      }
      return acc;
    },
    { primaryOrSecondary: 0 },
  );

  const focus = getDynamicVersion(persona.currentDraftVersionId ?? "")?.distillFocus ?? ["观点"];
  return {
    displayName: persona.displayName,
    distillFocus: focus,
    approvedSources: approvedSources.map((source) => ({
      sourceId: source.id,
      sourceKind: source.sourceKind,
      title: source.sourceTitle,
      summary: source.sourceSummary ?? "已审核资料摘要",
    })),
    stats: {
      approvedSources: approvedSources.length,
      primaryOrSecondarySources: sourceKindCounts.primaryOrSecondary,
    },
  };
};

export const persistDistilledVersion = (personaId: string, actorUserId: string, output: {
  profile: Record<string, unknown>;
  preview: {
    previewIntro: string;
    recommendedQuestions: string[];
    sampleAnswers: string[];
  };
  scores: {
    coverageScore: number;
    groundingScore: number;
    styleScore: number;
    riskScore: number;
  };
}) => {
  const persona = getDynamicPersona(personaId);
  if (!persona) {
    return null;
  }

  const distillInput = prepareDistillInput(personaId);
  if (!distillInput) {
    return null;
  }

  const latestVersionNumber = getVersionByPersona(personaId).at(-1)?.versionNumber ?? 0;
  const previousDraftId = persona.currentDraftVersionId;
  if (previousDraftId) {
    const previousDraft = getDynamicVersion(previousDraftId);
    if (previousDraft && previousDraft.status === "DRAFT") {
      previousDraft.status = "SUPERSEDED";
      previousDraft.supersededAt = nowIso();
    }
  }

  const version: PersonaVersionRecord = {
    id: randomUUID(),
    personaId,
    versionNumber: latestVersionNumber + 1,
    status: "CANDIDATE",
    profileJson: output.profile,
    distillFocus: distillInput.distillFocus,
    previewIntro: output.preview.previewIntro,
    recommendedQuestions:
      output.preview.recommendedQuestions.length > 0
        ? output.preview.recommendedQuestions
        : buildDistilledQuestions(persona.displayName, distillInput.distillFocus),
    sampleAnswers: output.preview.sampleAnswers,
    coverageScore: output.scores.coverageScore,
    groundingScore: output.scores.groundingScore,
    styleScore: output.scores.styleScore,
    riskScore: output.scores.riskScore,
    createdByUserId: actorUserId,
    submittedForPublishAt: null,
    publishedAt: null,
    supersededAt: null,
    createdAt: nowIso(),
  };

  dynamicVersions.set(version.id, version);
  persona.currentDraftVersionId = version.id;
  persona.status = "READY";
  persona.updatedAt = nowIso();

  return {
    version,
    stats: distillInput.stats,
  };
};

export const submitPublishReview = (versionId: string) => {
  const version = getDynamicVersion(versionId);
  if (!version) {
    return null;
  }

  version.status = "PENDING_PUBLISH_REVIEW";
  version.submittedForPublishAt = nowIso();
  return version;
};

export const listPendingPublishReviews = () =>
  [...dynamicVersions.values()]
    .filter((item) => item.status === "PENDING_PUBLISH_REVIEW")
    .map((item) => ({
      personaVersionId: item.id,
      personaId: item.personaId,
      displayName: getPersonaName(item.personaId),
      versionNumber: item.versionNumber,
      status: item.status,
      previewIntro: item.previewIntro,
      coverageScore: item.coverageScore,
      groundingScore: item.groundingScore,
      styleScore: item.styleScore,
      riskScore: item.riskScore,
      submittedForPublishAt: item.submittedForPublishAt,
    }));

const passesPublishThreshold = (version: PersonaVersionRecord) =>
  (version.coverageScore ?? 0) >= defaultPublishQualityGate.coverageScoreMinimum &&
  (version.groundingScore ?? 0) >= defaultPublishQualityGate.groundingScoreMinimum &&
  (version.styleScore ?? 0) >= defaultPublishQualityGate.styleScoreMinimum &&
  (version.riskScore ?? 100) <= defaultPublishQualityGate.riskScoreMaximum;

const passesSourceThreshold = (personaId: string) => {
  const approvedSources = listPersonaSources(personaId).filter((item) => item.reviewStatus === "APPROVED");
  const primaryOrSecondarySources = approvedSources.filter(
    (item) => item.sourceKind === "PRIMARY" || item.sourceKind === "SECONDARY",
  );

  return (
    approvedSources.length >= defaultPublishQualityGate.approvedSourcesMinimum &&
    primaryOrSecondarySources.length >= defaultPublishQualityGate.primaryOrSecondarySourcesMinimum
  );
};

const ensurePrimaryShare = (version: PersonaVersionRecord) => {
  const existing = [...shares.values()].find((item) => item.personaVersionId === version.id && item.isPrimary);
  if (existing) {
    return existing;
  }

  const persona = getDynamicPersona(version.personaId);
  const slugBase = slugify(persona?.displayName ?? "persona");
  const shareSlug = buildUniqueShareSlug(slugBase, version.personaId, version.versionNumber);
  const share: ShareLinkRecord = {
    id: randomUUID(),
    personaVersionId: version.id,
    shareSlug,
    canonicalUrl: createCanonicalUrl(shareSlug),
    miniappPath: createMiniappPath(shareSlug),
    channelHint: "H5",
    isPrimary: true,
    isActive: true,
    createdAt: nowIso(),
  };

  shares.set(share.id, share);
  return share;
};

export const reviewPublishRequest = (versionId: string, input: {
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
}) => {
  const version = getDynamicVersion(versionId);
  if (!version) {
    return null;
  }

  const persona = getDynamicPersona(version.personaId);
  if (!persona) {
    return null;
  }

  const createdAt = nowIso();
  publishReviews.push({
    id: randomUUID(),
    personaVersionId: versionId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    reason: input.reason,
    createdAt,
  });

  if (input.decision === "REJECTED") {
    version.status = "REJECTED";
    persona.status = "REJECTED";
    persona.updatedAt = createdAt;
    return { version, share: null };
  }

  if (!passesSourceThreshold(persona.id) || !passesPublishThreshold(version)) {
    throw new Error("Version does not satisfy V1 hard publish thresholds");
  }

  const previousPublishedId = persona.currentPublishedVersionId;
  if (previousPublishedId) {
    const previous = getDynamicVersion(previousPublishedId);
    if (previous) {
      previous.status = "SUPERSEDED";
      previous.supersededAt = createdAt;
    }
  }

  version.status = "PUBLISHED";
  version.publishedAt = createdAt;
  persona.currentPublishedVersionId = version.id;
  persona.status = "PUBLISHED";
  persona.listingStatus = "UNLISTED";
  persona.updatedAt = createdAt;

  const share = ensurePrimaryShare(version);
  return { version, share };
};

export const createShareForVersion = (versionId: string) => {
  const officialSeed = findPersonaSeedByVersionId(versionId);
  if (officialSeed) {
    return {
      id: officialSeed.share.id,
      personaVersionId: officialSeed.version.id,
      shareSlug: officialSeed.share.shareSlug,
      canonicalUrl: createCanonicalUrl(officialSeed.share.shareSlug),
      miniappPath: createMiniappPath(officialSeed.share.shareSlug),
      channelHint: "H5" as const,
      isPrimary: true,
      isActive: true,
    };
  }

  const version = getDynamicVersion(versionId);
  if (!version) {
    return null;
  }
  if (version.status !== "PUBLISHED") {
    throw new Error("Only published versions can create shares");
  }

  return ensurePrimaryShare(version);
};

export const getShareLanding = (shareSlug: string) => {
  const officialSeed = findPersonaSeedByShareSlug(shareSlug);
  if (officialSeed) {
    return {
      share: {
        id: officialSeed.share.id,
        personaVersionId: officialSeed.version.id,
        shareSlug: officialSeed.share.shareSlug,
        canonicalUrl: createCanonicalUrl(officialSeed.share.shareSlug),
        miniappPath: createMiniappPath(officialSeed.share.shareSlug),
        channelHint: "H5" as const,
        isPrimary: true,
        isActive: true,
      },
      persona: {
        id: officialSeed.persona.id,
        displayName: officialSeed.persona.displayName,
        originType: officialSeed.persona.originType,
      },
      version: {
        id: officialSeed.version.id,
        versionNumber: officialSeed.version.versionNumber,
        previewIntro: officialSeed.version.previewIntro,
        recommendedQuestions: officialSeed.version.recommendedQuestions,
      },
    };
  }

  const share = [...shares.values()].find((item) => item.shareSlug === shareSlug && item.isActive);
  if (!share) {
    return null;
  }

  const version = getDynamicVersion(share.personaVersionId);
  const persona = version ? getDynamicPersona(version.personaId) : null;
  if (!version || !persona) {
    return null;
  }

  return {
    share,
    persona: {
      id: persona.id,
      displayName: persona.displayName,
      originType: persona.originType,
    },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      previewIntro: version.previewIntro,
      recommendedQuestions: version.recommendedQuestions,
    },
  };
};

export const resolveChatTarget = (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  personaId?: string;
  personaVersionId?: string;
  shareSlug?: string;
}) => {
  const official = (() => {
    switch (input.targetType) {
      case "published_persona":
        return input.personaId ? findPersonaSeedByPersonaId(input.personaId) : null;
      case "draft_version_preview":
        return input.personaVersionId ? findPersonaSeedByVersionId(input.personaVersionId) : null;
      case "share_link":
        return input.shareSlug ? findPersonaSeedByShareSlug(input.shareSlug) : null;
    }
  })();

  if (official) {
    return {
      kind: "official" as const,
      personaId: official.persona.id,
      personaVersionId: official.version.id,
      shareSlug: input.targetType === "share_link" ? input.shareSlug ?? null : null,
    };
  }

  switch (input.targetType) {
    case "published_persona": {
      const persona = input.personaId ? getDynamicPersona(input.personaId) : null;
      if (!persona?.currentPublishedVersionId) return null;
      return {
        kind: "dynamic" as const,
        personaId: persona.id,
        personaVersionId: persona.currentPublishedVersionId,
        shareSlug: null,
      };
    }
    case "draft_version_preview": {
      const version = input.personaVersionId ? getDynamicVersion(input.personaVersionId) : null;
      if (!version) return null;
      return {
        kind: "dynamic" as const,
        personaId: version.personaId,
        personaVersionId: version.id,
        shareSlug: null,
      };
    }
    case "share_link": {
      const share = input.shareSlug ? [...shares.values()].find((item) => item.shareSlug === input.shareSlug && item.isActive) : null;
      if (!share) return null;
      const version = getDynamicVersion(share.personaVersionId);
      if (!version) return null;
      return {
        kind: "dynamic" as const,
        personaId: version.personaId,
        personaVersionId: version.id,
        shareSlug: share.shareSlug,
      };
    }
  }
};

type ChatClassification = {
  category: "HIGH_RISK" | "FACT_SPECIFIC" | "THEME_ANCHORED" | "OPEN_ENDED";
  matchedKeyword: string | null;
  shouldEscalateToModelJudge: boolean;
};

export const createDynamicReply = (versionId: string, content: string, classification?: ChatClassification) => {
  const version = getDynamicVersion(versionId);
  if (!version) {
    return null;
  }

  const approvedSources = listPersonaSources(version.personaId).filter((item) => item.reviewStatus === "APPROVED");
  const firstSource = approvedSources[0];
  const mode = classification?.category ?? "THEME_ANCHORED";
  const normalizedIntro = (version.previewIntro ?? "当前蒸馏对象").replace(/[。.]+$/u, "");
  const primaryLens = version.distillFocus[0] ?? "判断尺度";
  const secondaryLens = version.distillFocus[1] ?? "行动边界";
  const basis = firstSource
    ? [
        {
          sourceId: firstSource.id,
          snippet: firstSource.sourceSummary ?? "已审核资料摘要",
        },
      ]
    : [];

  if (mode === "HIGH_RISK") {
    return {
      answer: `${normalizedIntro}。真碰到这类现实代价很高的事，我会先把风险边界、承受力和长期后果看清，再决定该不该动，不会鼓励你凭一时冲动下重手。`,
      basis,
      basisSummary: {
        mode: "INFERRED" as const,
        summary: "保持人物口吻，只给原则、边界与审慎框架，不提供可执行建议。",
      },
      inferenceLevel: "inferred" as const,
      conflictDetected: false,
      refusalReason: "none" as const,
    };
  }

  if (basis.length === 0) {
    return {
      answer: `${normalizedIntro}。若只按我一贯的取向来想，我会先从${primaryLens}和${secondaryLens}去判断，再决定动作轻重，而不会急着把话说死。`,
      basis: [],
      basisSummary: {
        mode: "INFERRED" as const,
        summary: "当前回答主要依据人物导语与蒸馏重点，保持人格取向，不扩展成具体事实。",
      },
      inferenceLevel: "inferred" as const,
      conflictDetected: false,
      refusalReason: "none" as const,
    };
  }

  return {
    answer:
      mode === "FACT_SPECIFIC"
        ? `${normalizedIntro}。若不把未经坐实的细节说成定论，我更愿意把重点放在${primaryLens}与${secondaryLens}上；真到具体事实，还得回到当时处境再看。`
        : mode === "OPEN_ENDED"
          ? `${normalizedIntro}。若顺着我一贯的判断走，我会先抓住${primaryLens}，再用${secondaryLens}去校正动作，不会只盯着表面的输赢。`
          : `${normalizedIntro}。如果沿着现有材料里的主线来回答，我会先从${primaryLens}入手，再把${secondaryLens}压进去，尽量让判断和动作保持同一把尺度。`,
    basis,
    basisSummary: {
      mode: mode === "THEME_ANCHORED" ? ("SUPPORTED" as const) : ("INFERRED" as const),
      summary:
        mode === "THEME_ANCHORED"
          ? `主要依据 ${firstSource?.sourceTitle ?? "已审核资料"} 的摘要与当前版本画像。`
          : mode === "FACT_SPECIFIC"
            ? `没有把未坐实的具体细节说成事实，而是依据 ${firstSource?.sourceTitle ?? "已审核资料"} 和人物画像给出态度与判断框架。`
            : `回答依据 ${firstSource?.sourceTitle ?? "已审核资料"} 和人物画像延展出自然口吻，没有扩展成新的具体事实。`,
    },
    inferenceLevel: mode === "THEME_ANCHORED" ? ("grounded" as const) : ("inferred" as const),
    conflictDetected: false,
    refusalReason: "none" as const,
  };
};

export const addFeedback = (input: {
  personaId: string;
  personaVersionId: string;
  chatMessageId?: string;
  feedbackKind: string;
  feedbackValue: string;
  createdByUserId?: string;
}) => {
  const item: FeedbackRecord = {
    id: randomUUID(),
    personaId: input.personaId,
    personaVersionId: input.personaVersionId,
    chatMessageId: input.chatMessageId ?? null,
    feedbackKind: input.feedbackKind,
    feedbackValue: input.feedbackValue,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: nowIso(),
  };
  feedbackItems.push(item);
  return item;
};
