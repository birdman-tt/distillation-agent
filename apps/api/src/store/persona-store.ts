import { randomUUID } from "node:crypto";

import { defaultPublishQualityGate } from "@hall-of-fame/domain";

import {
  addDynamicFeedback,
  canAccessDynamicPersonaVersion,
  canManageDynamicPersona,
  createDynamicPersona,
  createDynamicShareForVersion,
  createDynamicTextSource,
  createDynamicUrlSource,
  getDynamicPersonaDetail,
  getDynamicPersonaVersion,
  getDynamicShareLanding,
  listApprovedDynamicSourceEvidence,
  listDynamicPersonaSources,
  listDynamicPersonaVersions,
  listPendingDynamicPublishReviews,
  listPendingDynamicSourceReviews,
  persistDynamicDistilledVersion,
  persistDynamicUrlSourceIngestResult,
  resolveDynamicChatTarget,
  reviewDynamicPublishRequest,
  reviewDynamicSource,
  submitDynamicPublishReview,
  transferDynamicPersonaOwnership,
  updateDynamicPersona,
  type PersonaRecord,
  type PersonaVersionRecord,
  type SourceRecord,
} from "../db/repositories/dynamic-persona-repository.js";
import {
  findPersonaSeedByPersonaId,
  findPersonaSeedByShareSlug,
  findPersonaSeedByVersionId,
  listFeaturedPersonae,
} from "../seed/official-personae.js";
import { hashNormalizedUrl, normalizeUrl } from "../utils/url-safety.js";

const nowIso = () => new Date().toISOString();

const getPersonaName = async (personaId: string) =>
  (await getDynamicPersonaDetail(personaId))?.persona.displayName ??
  findPersonaSeedByPersonaId(personaId)?.persona.displayName ??
  "Unknown Persona";

const buildDistilledQuestions = (displayName: string, focus: string[]) => {
  const primaryFocus = focus[0] ?? "观点";
  return [
    `如果从 ${primaryFocus} 来看，${displayName} 会怎么回答？`,
    `${displayName} 最在意的问题会是什么？`,
    `站在 ${displayName} 的角度，应该先做什么？`,
  ];
};

export const listFeaturedHall = () =>
  listFeaturedPersonae().map((seed) => ({
    ...seed.persona,
    currentPublishedVersionId: seed.version.id,
    previewIntro: seed.version.previewIntro,
    recommendedQuestions: seed.version.recommendedQuestions,
  }));

export const getPersonaDetail = async (personaId: string) => {
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

  const detail = await getDynamicPersonaDetail(personaId);
  if (!detail) {
    return null;
  }

  return {
    persona: {
      id: detail.persona.id,
      displayName: detail.persona.displayName,
      originType: detail.persona.originType,
      personaType: detail.persona.personaType,
      listingStatus: detail.persona.listingStatus,
      status: detail.persona.status,
      featuredRank: detail.persona.featuredRank,
      currentPublishedVersionId: detail.version.id,
    },
    version: detail.version,
  };
};

export const createPersona = async (input: {
  displayName: string;
  personaType: PersonaRecord["personaType"];
  originType: PersonaRecord["originType"];
  distillFocus: string[];
  creatorUserId: string;
}) => {
  const createdAt = nowIso();
  return createDynamicPersona({
    personaId: randomUUID(),
    versionId: randomUUID(),
    displayName: input.displayName,
    originType: "USER",
    personaType: input.personaType,
    distillFocus: input.distillFocus,
    creatorUserId: input.creatorUserId,
    createdAt,
  });
};

export const updatePersona = async (
  personaId: string,
  input: Partial<Pick<PersonaRecord, "displayName" | "listingStatus" | "status">>,
) => updateDynamicPersona(personaId, input);

export const getPersonaStatus = async (personaId: string) => {
  const detail = await getPersonaDetail(personaId);
  if (!detail) {
    return null;
  }

  const dynamicDetail = await getDynamicPersonaDetail(personaId);
  return {
    personaId: detail.persona.id,
    status: detail.persona.status,
    currentDraftVersionId: dynamicDetail?.persona.currentDraftVersionId ?? null,
    currentPublishedVersionId: detail.persona.currentPublishedVersionId,
  };
};

export const listPersonaVersions = async (personaId: string) => {
  const seed = findPersonaSeedByPersonaId(personaId);
  if (seed) {
    return [
      {
        ...seed.version,
        personaId: seed.persona.id,
        status: "PUBLISHED" as const,
        coverageScore: 85,
        groundingScore: 85,
        styleScore: 80,
        riskScore: 10,
      },
    ];
  }

  return listDynamicPersonaVersions(personaId);
};

export const getPersonaVersion = async (versionId: string) => {
  const seed = findPersonaSeedByVersionId(versionId);
  if (seed) {
    return {
      ...seed.version,
      personaId: seed.persona.id,
      status: "PUBLISHED" as const,
      coverageScore: 85,
      groundingScore: 85,
      styleScore: 80,
      riskScore: 10,
    };
  }

  return getDynamicPersonaVersion(versionId);
};

export const canManagePersona = async (
  personaId: string,
  actorUserId: string,
  actorRole: "ANONYMOUS" | "USER" | "REVIEWER",
) => {
  if (actorRole === "REVIEWER") {
    return true;
  }

  return canManageDynamicPersona(personaId, actorUserId);
};

export const canAccessPersonaVersion = async (
  versionId: string,
  actorUserId: string | null,
  actorRole: "ANONYMOUS" | "USER" | "REVIEWER" | null,
) => {
  const officialSeed = findPersonaSeedByVersionId(versionId);
  if (officialSeed) {
    return true;
  }

  if (actorRole === "REVIEWER") {
    return true;
  }

  return canAccessDynamicPersonaVersion(versionId, actorUserId);
};

export const transferPersonaOwnership = async (fromUserId: string, toUserId: string) => {
  await transferDynamicPersonaOwnership(fromUserId, toUserId);
};

export const createTextSource = async (
  personaId: string,
  input: {
    content: string;
    title?: string;
    author?: string;
    sourceKind: SourceRecord["sourceKind"];
    submittedByUserId: string;
  },
) =>
  createDynamicTextSource({
    personaId,
    content: input.content,
    title: input.title,
    author: input.author,
    sourceKind: input.sourceKind,
    submittedByUserId: input.submittedByUserId,
  });

export const createUrlSource = async (
  personaId: string,
  input: {
    url: string;
    title?: string;
    author?: string;
    sourceKind: SourceRecord["sourceKind"];
    submittedByUserId: string;
  },
) => {
  const normalizedUrl = normalizeUrl(input.url);
  return createDynamicUrlSource({
    personaId,
    url: input.url,
    title: input.title,
    author: input.author,
    sourceKind: input.sourceKind,
    submittedByUserId: input.submittedByUserId,
    normalizedUrl,
    normalizedUrlHash: hashNormalizedUrl(normalizedUrl),
  });
};

export const persistUrlSourceIngestResult = async (
  sourceId: string,
  input: {
    normalizedUrl: string;
    normalizedUrlHash: string;
    snapshot: {
      title: string;
      author: string | null;
      normalizedText: string;
    };
  },
) => persistDynamicUrlSourceIngestResult({ sourceId, ...input });

export const listPersonaSources = async (personaId: string) => listDynamicPersonaSources(personaId);

export const listApprovedSourceEvidence = async (personaId: string) => {
  const items = await listApprovedDynamicSourceEvidence(personaId);
  return items.map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    snippet: item.snippet ?? "已审核资料摘要",
  }));
};

export const listPendingSourceReviews = async () => {
  const items = await listPendingDynamicSourceReviews();
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      displayName: item.displayName ?? (await getPersonaName(item.personaId)),
      createdAt: new Date(item.createdAt).toISOString(),
    })),
  );
};

export const reviewSource = async (
  sourceId: string,
  input: {
    reviewerUserId: string;
    decision: "APPROVED" | "REJECTED";
    reason: string;
  },
) =>
  reviewDynamicSource({
    sourceId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    reason: input.reason,
  });

export const prepareDistillInput = async (personaId: string) => {
  const detail = await getDynamicPersonaDetail(personaId);
  if (!detail) {
    return null;
  }

  const approvedSources = (await listDynamicPersonaSources(personaId)).filter((item) => item.reviewStatus === "APPROVED");
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

  const focus = detail.version.distillFocus ?? ["观点"];
  return {
    displayName: detail.persona.displayName,
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

export const persistDistilledVersion = async (
  personaId: string,
  actorUserId: string,
  output: {
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
  },
) => {
  const detail = await getDynamicPersonaDetail(personaId);
  if (!detail) {
    return null;
  }

  const distillInput = await prepareDistillInput(personaId);
  if (!distillInput) {
    return null;
  }

  const version = await persistDynamicDistilledVersion({
    personaId,
    actorUserId,
    profileJson: output.profile,
    previewIntro: output.preview.previewIntro,
    recommendedQuestions: output.preview.recommendedQuestions,
    sampleAnswers: output.preview.sampleAnswers,
    coverageScore: output.scores.coverageScore,
    groundingScore: output.scores.groundingScore,
    styleScore: output.scores.styleScore,
    riskScore: output.scores.riskScore,
    fallbackQuestions: buildDistilledQuestions(detail.persona.displayName, distillInput.distillFocus),
  });

  if (!version) {
    return null;
  }

  return {
    version,
    stats: distillInput.stats,
  };
};

export const submitPublishReview = async (versionId: string) => submitDynamicPublishReview(versionId);

export const listPendingPublishReviews = async () => {
  const items = await listPendingDynamicPublishReviews();
  return items.map((item) => ({
    ...item,
    submittedForPublishAt: item.submittedForPublishAt ? new Date(item.submittedForPublishAt).toISOString() : null,
  }));
};

const passesPublishThreshold = (version: PersonaVersionRecord) =>
  (version.coverageScore ?? 0) >= defaultPublishQualityGate.coverageScoreMinimum &&
  (version.groundingScore ?? 0) >= defaultPublishQualityGate.groundingScoreMinimum &&
  (version.styleScore ?? 0) >= defaultPublishQualityGate.styleScoreMinimum &&
  (version.riskScore ?? 100) <= defaultPublishQualityGate.riskScoreMaximum;

const passesSourceThreshold = async (personaId: string) => {
  const approvedSources = (await listDynamicPersonaSources(personaId)).filter((item) => item.reviewStatus === "APPROVED");
  const primaryOrSecondarySources = approvedSources.filter(
    (item) => item.sourceKind === "PRIMARY" || item.sourceKind === "SECONDARY",
  );

  return (
    approvedSources.length >= defaultPublishQualityGate.approvedSourcesMinimum &&
    primaryOrSecondarySources.length >= defaultPublishQualityGate.primaryOrSecondarySourcesMinimum
  );
};

export const reviewPublishRequest = async (
  versionId: string,
  input: {
    reviewerUserId: string;
    decision: "APPROVED" | "REJECTED";
    reason: string;
  },
) => {
  const version = await getDynamicPersonaVersion(versionId);
  if (!version) {
    return null;
  }

  if (input.decision === "APPROVED") {
    if (!(await passesSourceThreshold(version.personaId)) || !passesPublishThreshold(version)) {
      throw new Error("Version does not satisfy V1 hard publish thresholds");
    }
  }

  return reviewDynamicPublishRequest({
    versionId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    reason: input.reason,
  });
};

export const createShareForVersion = async (versionId: string) => {
  const officialSeed = findPersonaSeedByVersionId(versionId);
  if (officialSeed) {
    return {
      id: officialSeed.share.id,
      personaVersionId: officialSeed.version.id,
      shareSlug: officialSeed.share.shareSlug,
      canonicalUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/share/${officialSeed.share.shareSlug}`,
      miniappPath: `/pages/share/index?slug=${encodeURIComponent(officialSeed.share.shareSlug)}`,
      channelHint: "H5" as const,
      isPrimary: true,
      isActive: true,
    };
  }

  return createDynamicShareForVersion(versionId);
};

export const getShareLanding = async (shareSlug: string) => {
  const officialSeed = findPersonaSeedByShareSlug(shareSlug);
  if (officialSeed) {
    return {
      share: {
        id: officialSeed.share.id,
        personaVersionId: officialSeed.version.id,
        shareSlug: officialSeed.share.shareSlug,
        canonicalUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/share/${officialSeed.share.shareSlug}`,
        miniappPath: `/pages/share/index?slug=${encodeURIComponent(officialSeed.share.shareSlug)}`,
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

  return getDynamicShareLanding(shareSlug);
};

export const resolveChatTarget = async (input: {
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

  return resolveDynamicChatTarget(input);
};

type ChatClassification = {
  category: "HIGH_RISK" | "FACT_SPECIFIC" | "THEME_ANCHORED" | "OPEN_ENDED";
  matchedKeyword: string | null;
  shouldEscalateToModelJudge: boolean;
};

export const createDynamicReply = async (versionId: string, content: string, classification?: ChatClassification) => {
  const version = await getDynamicPersonaVersion(versionId);
  if (!version) {
    return null;
  }

  const approvedSources = (await listDynamicPersonaSources(version.personaId)).filter((item) => item.reviewStatus === "APPROVED");
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

export const addFeedback = async (input: {
  personaId: string;
  personaVersionId: string;
  chatMessageId?: string;
  feedbackKind: string;
  feedbackValue: string;
  createdByUserId?: string;
}) =>
  addDynamicFeedback({
    personaId: input.personaId,
    personaVersionId: input.personaVersionId,
    chatMessageId: input.chatMessageId,
    feedbackKind: input.feedbackKind,
    feedbackValue: input.feedbackValue,
    createdByUserId: input.createdByUserId,
  });
