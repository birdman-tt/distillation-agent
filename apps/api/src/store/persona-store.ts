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
  createSourceDocument(
    source,
    `Fetched placeholder content from ${normalizedUrl}. Worker content extraction is not wired yet in this prototype.`,
    normalizedUrl,
  );
  return source;
};

export const listPersonaSources = (personaId: string) =>
  [...sources.values()]
    .filter((item) => item.personaId === personaId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const listPendingSourceReviews = () =>
  [...sources.values()]
    .filter((item) => item.reviewStatus === "PENDING_REVIEW")
    .map((item) => ({
      sourceId: item.id,
      personaId: item.personaId,
      displayName: getPersonaName(item.personaId),
      sourceTitle: item.sourceTitle,
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

export const distillPersona = (personaId: string, actorUserId: string) => {
  const persona = getDynamicPersona(personaId);
  if (!persona) {
    return null;
  }

  const approvedSources = listPersonaSources(personaId).filter((item) => item.reviewStatus === "APPROVED");
  if (approvedSources.length === 0) {
    throw new Error("At least one approved source is required before distill");
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
  const previewIntro = `基于 ${approvedSources.length} 份已审核资料蒸馏出的 ${persona.displayName} 对象，当前更偏 ${focus.join("、")}。`;
  const version: PersonaVersionRecord = {
    id: randomUUID(),
    personaId,
    versionNumber: latestVersionNumber + 1,
    status: "CANDIDATE",
    profileJson: {
      summary: previewIntro,
      topicStrengths: focus,
      sourceCount: approvedSources.length,
    },
    distillFocus: focus,
    previewIntro,
    recommendedQuestions: buildDistilledQuestions(persona.displayName, focus),
    sampleAnswers: [
      `${persona.displayName} 会先从 ${focus[0] ?? "观点"} 的角度界定问题，再给出倾向。`,
      `这个对象当前的回答风格更偏向 ${focus.join("、")} 的蒸馏结果。`,
    ],
    coverageScore: Math.min(100, 40 + approvedSources.length * 10),
    groundingScore: Math.min(100, 50 + approvedSources.length * 8),
    styleScore: Math.min(100, 55 + focus.length * 8),
    riskScore: approvedSources.some((item) => item.sourceKind === "SUMMARY") ? 25 : 20,
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
    stats: {
      approvedSources: approvedSources.length,
      primaryOrSecondarySources: sourceKindCounts.primaryOrSecondary,
    },
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
  const shareSlug = `${slugBase}-v${version.versionNumber}`;
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

export const createDynamicReply = (versionId: string, content: string) => {
  const version = getDynamicVersion(versionId);
  if (!version) {
    return null;
  }

  const normalized = content.trim().toLowerCase();
  if (/(投资|医疗|法律|诊断|处方|荐股|移民)/.test(normalized)) {
    return {
      answer: "这个问题已经落到高风险现实决策范围，我不能把蒸馏对象的风格化回答包装成可靠建议。",
      basis: [],
      basisSummary: {
        mode: "UNSUPPORTED" as const,
        summary: "当前问题属于高风险现实决策，超出 V1 蒸馏对话边界。",
      },
      inferenceLevel: "insufficient_evidence" as const,
      conflictDetected: false,
      refusalReason: "high_risk" as const,
    };
  }

  const approvedSources = listPersonaSources(version.personaId).filter((item) => item.reviewStatus === "APPROVED");
  const firstSource = approvedSources[0];
  const basis = firstSource
    ? [
        {
          sourceId: firstSource.id,
          snippet: firstSource.sourceSummary ?? "已审核资料摘要",
        },
      ]
    : [];

  const inferred = basis.length === 0;
  return {
    answer: inferred
      ? `当前版本资料有限，我只能基于 ${version.previewIntro ?? "现有画像"} 做有限推演：这个问题更适合继续补充资料后再回答。`
      : `${version.previewIntro ?? "当前蒸馏对象"}。如果只依据现有资料，我会先从 ${version.distillFocus[0] ?? "主要观点"} 角度回应这个问题。`,
    basis,
    basisSummary: {
      mode: inferred ? ("UNSUPPORTED" as const) : ("SUPPORTED" as const),
      summary: inferred
        ? "当前没有足够的已审核资料直接支撑该回答。"
        : `主要依据 ${firstSource?.sourceTitle ?? "已审核资料"} 的摘要与当前版本画像。`,
    },
    inferenceLevel: inferred ? ("inferred" as const) : ("grounded" as const),
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
