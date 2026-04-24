import { randomUUID } from "node:crypto";
import type { JSONValue } from "postgres";

import { getSql, withTransaction } from "../client.js";
import { ensureUserShadow } from "./user-shadow-repository.js";

export type PersonaRecord = {
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

export type PersonaVersionRecord = {
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

export type SourceRecord = {
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

export type SourceDocumentRecord = {
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

export type EvidenceSpanRecord = {
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

export type ShareLinkRecord = {
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

export type SourceReviewRecord = {
  id: string;
  sourceId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  createdAt: string;
};

export type PublishReviewRecord = {
  id: string;
  personaVersionId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  createdAt: string;
};

export type FeedbackRecord = {
  id: string;
  personaId: string;
  personaVersionId: string;
  chatMessageId: string | null;
  feedbackKind: string;
  feedbackValue: string;
  createdByUserId: string | null;
  createdAt: string;
};

type TimestampInput = string | Date | null;

type PersonaRow = {
  id: string;
  displayName: string;
  originType: PersonaRecord["originType"];
  personaType: PersonaRecord["personaType"];
  listingStatus: PersonaRecord["listingStatus"];
  status: PersonaRecord["status"];
  creatorUserId: string | null;
  featuredRank: number | null;
  currentDraftVersionId: string | null;
  currentPublishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersonaVersionRow = {
  id: string;
  personaId: string;
  versionNumber: number;
  status: PersonaVersionRecord["status"];
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
  submittedForPublishAt: Date | null;
  publishedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
};

type SourceRow = {
  id: string;
  personaId: string;
  inputType: SourceRecord["inputType"];
  reviewStatus: SourceRecord["reviewStatus"];
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceSummary: string | null;
  sourceKind: SourceRecord["sourceKind"];
  sourcePublishedAt: Date | null;
  submittedByUserId: string | null;
  normalizedUrl: string | null;
  normalizedUrlHash: string | null;
  trustScore: number | null;
  reviewReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

type SourceDocumentRow = {
  id: string;
  sourceId: string;
  title: string | null;
  author: string | null;
  url: string | null;
  normalizedText: string;
  contentHash: string;
  fetchStatusCode: number | null;
  fetchError: string | null;
  fetchedAt: Date | null;
  createdAt: Date;
};

type EvidenceSpanRow = {
  id: string;
  documentId: string;
  sectionLabel: string | null;
  spanStart: number;
  spanEnd: number;
  normalizedQuote: string;
  sourceKind: EvidenceSpanRecord["sourceKind"];
  trustScore: number | null;
  dedupeGroupId: string | null;
  conflictGroupId: string | null;
  createdAt: Date;
};

type ShareRow = {
  id: string;
  personaVersionId: string;
  shareSlug: string;
  canonicalUrl: string;
  miniappPath: string;
  channelHint: ShareLinkRecord["channelHint"];
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
};

const toIsoString = (value: TimestampInput) => (value ? new Date(value).toISOString() : null);

const mapPersona = (row: PersonaRow): PersonaRecord => ({
  ...row,
  createdAt: toIsoString(row.createdAt)!,
  updatedAt: toIsoString(row.updatedAt)!,
});

const mapPersonaVersion = (row: PersonaVersionRow): PersonaVersionRecord => ({
  ...row,
  distillFocus: Array.isArray(row.distillFocus) ? row.distillFocus : [],
  recommendedQuestions: Array.isArray(row.recommendedQuestions) ? row.recommendedQuestions : [],
  sampleAnswers: Array.isArray(row.sampleAnswers) ? row.sampleAnswers : [],
  submittedForPublishAt: toIsoString(row.submittedForPublishAt),
  publishedAt: toIsoString(row.publishedAt),
  supersededAt: toIsoString(row.supersededAt),
  createdAt: toIsoString(row.createdAt)!,
});

const mapSource = (row: SourceRow): SourceRecord => ({
  ...row,
  sourcePublishedAt: toIsoString(row.sourcePublishedAt),
  reviewedAt: toIsoString(row.reviewedAt),
  createdAt: toIsoString(row.createdAt)!,
});

const mapSourceDocument = (row: SourceDocumentRow): SourceDocumentRecord => ({
  ...row,
  fetchedAt: toIsoString(row.fetchedAt),
  createdAt: toIsoString(row.createdAt)!,
});

const mapEvidenceSpan = (row: EvidenceSpanRow): EvidenceSpanRecord => ({
  ...row,
  createdAt: toIsoString(row.createdAt)!,
});

const mapShare = (row: ShareRow): ShareLinkRecord => ({
  ...row,
  createdAt: toIsoString(row.createdAt)!,
});

const baseUrl = () => process.env.PUBLIC_WEB_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
const createCanonicalUrl = (shareSlug: string) => `${baseUrl()}/share/${shareSlug}`;
const createMiniappPath = (shareSlug: string) => `/pages/share/index?slug=${encodeURIComponent(shareSlug)}`;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "persona";

const selectPersonaColumns = `
  id,
  display_name as "displayName",
  origin_type as "originType",
  persona_type as "personaType",
  listing_status as "listingStatus",
  status,
  creator_user_id as "creatorUserId",
  featured_rank as "featuredRank",
  current_draft_version_id as "currentDraftVersionId",
  current_published_version_id as "currentPublishedVersionId",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const selectPersonaVersionColumns = `
  id,
  persona_id as "personaId",
  version_number as "versionNumber",
  status,
  profile_json as "profileJson",
  distill_focus as "distillFocus",
  preview_intro as "previewIntro",
  recommended_questions as "recommendedQuestions",
  sample_answers as "sampleAnswers",
  coverage_score as "coverageScore",
  grounding_score as "groundingScore",
  style_score as "styleScore",
  risk_score as "riskScore",
  created_by_user_id as "createdByUserId",
  submitted_for_publish_at as "submittedForPublishAt",
  published_at as "publishedAt",
  superseded_at as "supersededAt",
  created_at as "createdAt"
`;

const selectSourceColumns = `
  id,
  persona_id as "personaId",
  input_type as "inputType",
  review_status as "reviewStatus",
  source_url as "sourceUrl",
  source_title as "sourceTitle",
  source_author as "sourceAuthor",
  source_summary as "sourceSummary",
  source_kind as "sourceKind",
  source_published_at as "sourcePublishedAt",
  submitted_by_user_id as "submittedByUserId",
  normalized_url as "normalizedUrl",
  normalized_url_hash as "normalizedUrlHash",
  trust_score as "trustScore",
  review_reason as "reviewReason",
  reviewed_by_user_id as "reviewedByUserId",
  reviewed_at as "reviewedAt",
  created_at as "createdAt"
`;

const selectSourceDocumentColumns = `
  id,
  source_id as "sourceId",
  title,
  author,
  url,
  normalized_text as "normalizedText",
  content_hash as "contentHash",
  fetch_status_code as "fetchStatusCode",
  fetch_error as "fetchError",
  fetched_at as "fetchedAt",
  created_at as "createdAt"
`;

const selectEvidenceSpanColumns = `
  id,
  document_id as "documentId",
  section_label as "sectionLabel",
  span_start as "spanStart",
  span_end as "spanEnd",
  normalized_quote as "normalizedQuote",
  source_kind as "sourceKind",
  trust_score as "trustScore",
  dedupe_group_id as "dedupeGroupId",
  conflict_group_id as "conflictGroupId",
  created_at as "createdAt"
`;

const selectShareColumns = `
  id,
  persona_version_id as "personaVersionId",
  share_slug as "shareSlug",
  canonical_url as "canonicalUrl",
  miniapp_path as "miniappPath",
  channel_hint as "channelHint",
  is_primary as "isPrimary",
  is_active as "isActive",
  created_at as "createdAt"
`;

const selectShareColumnsFromAlias = (alias: string) => `
  ${alias}.id as "id",
  ${alias}.persona_version_id as "personaVersionId",
  ${alias}.share_slug as "shareSlug",
  ${alias}.canonical_url as "canonicalUrl",
  ${alias}.miniapp_path as "miniappPath",
  ${alias}.channel_hint as "channelHint",
  ${alias}.is_primary as "isPrimary",
  ${alias}.is_active as "isActive",
  ${alias}.created_at as "createdAt"
`;

const createSourceDocumentWithSpan = async (
  sql: any,
  source: SourceRecord,
  normalizedText: string,
  url: string | null,
) => {
  const documentId = randomUUID();
  const createdAt = new Date().toISOString();
  const quote = normalizedText.slice(0, 240);
  const spanId = randomUUID();

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
      ${source.id}::uuid,
      ${source.sourceTitle},
      ${source.sourceAuthor},
      ${url},
      ${normalizedText},
      ${`${source.id}:${normalizedText.length}`},
      ${url ? 202 : null},
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
      ${source.sourceKind},
      ${source.trustScore},
      null,
      null,
      ${createdAt}
    )
  `;
};

const getDynamicPersonaRow = async (personaId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1 and origin_type = 'USER'`, [
    personaId,
  ]);
  return rows[0] ? mapPersona(rows[0]) : null;
};

const getDynamicVersionRow = async (versionId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<PersonaVersionRow[]>(
    `select ${selectPersonaVersionColumns} from persona_versions where id = $1`,
    [versionId],
  );
  return rows[0] ? mapPersonaVersion(rows[0]) : null;
};

export const createDynamicPersona = async (input: {
  personaId: string;
  versionId: string;
  displayName: string;
  positioning: string;
  originType: "USER";
  personaType: PersonaRecord["personaType"];
  distillFocus: string[];
  creatorUserId: string;
  createdAt: string;
}) => {
  await ensureUserShadow(input.creatorUserId);

  await withTransaction(async (sql) => {
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
        ${input.personaId}::uuid,
        ${input.displayName},
        ${input.originType},
        ${input.personaType},
        ${"PRIVATE"},
        ${"DRAFT"},
        ${input.creatorUserId}::uuid,
        null,
        null,
        null,
        ${input.createdAt},
        ${input.createdAt}
      )
    `;

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
        created_by_user_id,
        submitted_for_publish_at,
        published_at,
        superseded_at,
        created_at
      ) values (
        ${input.versionId}::uuid,
        ${input.personaId}::uuid,
        1,
        ${"DRAFT"},
        ${sql.json({
          summary: input.positioning,
          topicStrengths: input.distillFocus,
        })},
        ${sql.json(input.distillFocus)},
        ${input.positioning},
        ${sql.json([])},
        ${sql.json([])},
        null,
        null,
        null,
        null,
        ${input.creatorUserId}::uuid,
        null,
        null,
        null,
        ${input.createdAt}
      )
    `;

    await sql`
      update personae
         set current_draft_version_id = ${input.versionId}::uuid
       where id = ${input.personaId}::uuid
    `;
  });

  const [persona, version] = await Promise.all([getDynamicPersonaRow(input.personaId), getDynamicVersionRow(input.versionId)]);
  return {
    persona: persona!,
    version: version!,
  };
};

export const updateDynamicPersona = async (
  personaId: string,
  input: Partial<Pick<PersonaRecord, "displayName" | "listingStatus" | "status">>,
) => {
  const persona = await getDynamicPersonaRow(personaId);
  if (!persona) {
    return null;
  }

  const sql = getSql();
  const rows = await sql.unsafe<PersonaRow[]>(
    `update personae
       set display_name = coalesce($2, display_name),
           listing_status = coalesce($3, listing_status),
           status = coalesce($4, status),
           updated_at = now()
     where id = $1
     returning ${selectPersonaColumns}`,
    [personaId, input.displayName ?? null, input.listingStatus ?? null, input.status ?? null],
  );

  return rows[0] ? mapPersona(rows[0]) : null;
};

export const getDynamicPersonaDetail = async (personaId: string) => {
  const persona = await getDynamicPersonaRow(personaId);
  if (!persona) {
    return null;
  }

  const versionId = persona.currentPublishedVersionId ?? persona.currentDraftVersionId;
  if (!versionId) {
    return null;
  }

  const version = await getDynamicVersionRow(versionId);
  if (!version) {
    return null;
  }

  return { persona, version };
};

export const listDynamicPersonaVersions = async (personaId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<PersonaVersionRow[]>(
    `select ${selectPersonaVersionColumns}
       from persona_versions
      where persona_id = $1
      order by version_number asc`,
    [personaId],
  );
  return rows.map(mapPersonaVersion);
};

export const getDynamicPersonaVersion = async (versionId: string) => getDynamicVersionRow(versionId);

export const listDynamicPersonaeByCreator = async (creatorUserId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<PersonaRow[]>(
    `select ${selectPersonaColumns}
       from personae
      where creator_user_id = $1
        and origin_type = 'USER'
      order by updated_at desc, created_at desc`,
    [creatorUserId],
  );
  return rows.map(mapPersona);
};

export const getPrimaryDynamicShareByVersionId = async (personaVersionId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<ShareRow[]>(
    `select ${selectShareColumns}
       from share_links
      where persona_version_id = $1
        and is_primary = true
        and is_active = true
      limit 1`,
    [personaVersionId],
  );
  return rows[0] ? mapShare(rows[0]) : null;
};

export const transferDynamicPersonaOwnership = async (fromUserId: string, toUserId: string) => {
  if (fromUserId === toUserId) {
    return;
  }

  await ensureUserShadow(toUserId);
  const sql = getSql();
  await withTransaction(async (tx) => {
    await tx`
      update personae
         set creator_user_id = ${toUserId}::uuid,
             updated_at = now()
       where creator_user_id = ${fromUserId}::uuid
    `;
    await tx`
      update persona_versions
         set created_by_user_id = ${toUserId}::uuid
       where created_by_user_id = ${fromUserId}::uuid
    `;
    await tx`
      update persona_sources
         set submitted_by_user_id = ${toUserId}::uuid
       where submitted_by_user_id = ${fromUserId}::uuid
    `;
    await tx`
      update persona_feedback
         set created_by_user_id = ${toUserId}::uuid
       where created_by_user_id = ${fromUserId}::uuid
    `;
  });

  void sql;
};

export const canManageDynamicPersona = async (personaId: string, actorUserId: string) => {
  const persona = await getDynamicPersonaRow(personaId);
  return Boolean(persona && persona.creatorUserId === actorUserId);
};

export const canAccessDynamicPersonaVersion = async (versionId: string, actorUserId: string | null) => {
  const version = await getDynamicVersionRow(versionId);
  if (!version) {
    return false;
  }

  if (version.status === "PUBLISHED") {
    return true;
  }

  if (!actorUserId) {
    return false;
  }

  const persona = await getDynamicPersonaRow(version.personaId);
  return persona?.creatorUserId === actorUserId;
};

export const createDynamicTextSource = async (input: {
  personaId: string;
  content: string;
  title?: string;
  author?: string;
  sourceKind: SourceRecord["sourceKind"];
  submittedByUserId: string;
}) => {
  const persona = await getDynamicPersonaRow(input.personaId);
  if (!persona) {
    return null;
  }

  await ensureUserShadow(input.submittedByUserId);
  const sourceId = randomUUID();
  const createdAt = new Date().toISOString();
  const summary = input.content.slice(0, 160);
  const trustScore = input.sourceKind === "PRIMARY" ? 90 : input.sourceKind === "SECONDARY" ? 75 : 60;

  await withTransaction(async (sql) => {
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
        ${input.personaId}::uuid,
        ${"TEXT"},
        ${"APPROVED"},
        null,
        ${input.title ?? null},
        ${input.author ?? null},
        ${summary},
        ${input.sourceKind},
        null,
        ${input.submittedByUserId}::uuid,
        null,
        null,
        ${trustScore},
        null,
        null,
        ${createdAt},
        ${createdAt}
      )
    `;

    const source: SourceRecord = {
      id: sourceId,
      personaId: input.personaId,
      inputType: "TEXT",
      reviewStatus: "APPROVED",
      sourceUrl: null,
      sourceTitle: input.title ?? null,
      sourceAuthor: input.author ?? null,
      sourceSummary: summary,
      sourceKind: input.sourceKind,
      sourcePublishedAt: null,
      submittedByUserId: input.submittedByUserId,
      normalizedUrl: null,
      normalizedUrlHash: null,
      trustScore,
      reviewReason: null,
      reviewedByUserId: null,
      reviewedAt: createdAt,
      createdAt,
    };

    await createSourceDocumentWithSpan(sql, source, input.content.trim(), null);
  });

  return getPersonaSourceById(sourceId);
};

export const createDynamicUrlSource = async (input: {
  personaId: string;
  url: string;
  title?: string;
  author?: string;
  sourceKind: SourceRecord["sourceKind"];
  submittedByUserId: string;
  normalizedUrl: string;
  normalizedUrlHash: string;
}) => {
  const persona = await getDynamicPersonaRow(input.personaId);
  if (!persona) {
    return null;
  }

  await ensureUserShadow(input.submittedByUserId);
  const sourceId = randomUUID();
  const createdAt = new Date().toISOString();
  const trustScore = input.sourceKind === "PRIMARY" ? 85 : input.sourceKind === "SECONDARY" ? 70 : 55;
  const summary = `Imported from ${new URL(input.normalizedUrl).hostname}`;

  const sql = getSql();
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
      ${input.personaId}::uuid,
      ${"URL"},
      ${"APPROVED"},
      ${input.normalizedUrl},
      ${input.title ?? null},
      ${input.author ?? null},
      ${summary},
      ${input.sourceKind},
      null,
      ${input.submittedByUserId}::uuid,
      ${input.normalizedUrl},
      ${input.normalizedUrlHash},
      ${trustScore},
      null,
      null,
      ${createdAt},
      ${createdAt}
    )
  `;

  return getPersonaSourceById(sourceId);
};

export const persistDynamicUrlSourceIngestResult = async (input: {
  sourceId: string;
  normalizedUrl: string;
  normalizedUrlHash: string;
  snapshot: {
    title: string;
    author: string | null;
    normalizedText: string;
  };
}) => {
  const existing = await getPersonaSourceById(input.sourceId);
  if (!existing) {
    return null;
  }

  const sql = getSql();
  await withTransaction(async (tx) => {
    await tx`
      update persona_sources
         set normalized_url = ${input.normalizedUrl},
             normalized_url_hash = ${input.normalizedUrlHash},
             source_url = ${input.normalizedUrl},
             source_title = ${input.snapshot.title},
             source_author = ${input.snapshot.author},
             source_summary = ${input.snapshot.normalizedText.slice(0, 160)}
       where id = ${input.sourceId}::uuid
    `;

    await tx`delete from evidence_spans where document_id in (select id from source_documents where source_id = ${input.sourceId}::uuid)`;
    await tx`delete from source_documents where source_id = ${input.sourceId}::uuid`;

    const updatedSource: SourceRecord = {
      ...existing,
      sourceUrl: input.normalizedUrl,
      sourceTitle: input.snapshot.title,
      sourceAuthor: input.snapshot.author,
      sourceSummary: input.snapshot.normalizedText.slice(0, 160),
      normalizedUrl: input.normalizedUrl,
      normalizedUrlHash: input.normalizedUrlHash,
    };
    await createSourceDocumentWithSpan(tx, updatedSource, input.snapshot.normalizedText.trim(), input.normalizedUrl);
  });

  return getPersonaSourceById(input.sourceId);
};

export const getPersonaSourceById = async (sourceId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<SourceRow[]>(`select ${selectSourceColumns} from persona_sources where id = $1`, [sourceId]);
  return rows[0] ? mapSource(rows[0]) : null;
};

export const listDynamicPersonaSources = async (personaId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<SourceRow[]>(
    `select ${selectSourceColumns}
       from persona_sources
      where persona_id = $1
      order by created_at asc`,
    [personaId],
  );
  return rows.map(mapSource);
};

export const listApprovedDynamicSourceEvidence = async (personaId: string) => {
  const sql = getSql();
  return sql<{
    sourceId: string;
    title: string | null;
    snippet: string | null;
  }[]>`
    select
      id as "sourceId",
      source_title as "title",
      source_summary as "snippet"
    from persona_sources
    where persona_id = ${personaId}::uuid
      and review_status = 'APPROVED'
    order by created_at asc
  `;
};

export const listPendingDynamicSourceReviews = async () => {
  const sql = getSql();
  return sql<{
    sourceId: string;
    personaId: string;
    displayName: string;
    sourceTitle: string | null;
    sourceSummary: string | null;
    sourceKind: SourceRecord["sourceKind"];
    reviewStatus: SourceRecord["reviewStatus"];
    createdAt: Date;
  }[]>`
    select
      s.id as "sourceId",
      s.persona_id as "personaId",
      p.display_name as "displayName",
      s.source_title as "sourceTitle",
      s.source_summary as "sourceSummary",
      s.source_kind as "sourceKind",
      s.review_status as "reviewStatus",
      s.created_at as "createdAt"
    from persona_sources s
    join personae p on p.id = s.persona_id
    where s.review_status = 'PENDING_REVIEW'
      and p.origin_type = 'USER'
    order by s.created_at asc
  `;
};

export const reviewDynamicSource = async (input: {
  sourceId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
}) => {
  await ensureUserShadow(input.reviewerUserId);
  const reviewedAt = new Date().toISOString();

  await withTransaction(async (sql) => {
    await sql`
      update persona_sources
         set review_status = ${input.decision === "APPROVED" ? "APPROVED" : "REJECTED"},
             review_reason = ${input.reason},
             reviewed_by_user_id = ${input.reviewerUserId}::uuid,
             reviewed_at = ${reviewedAt}
       where id = ${input.sourceId}::uuid
    `;

    await sql`
      insert into source_reviews (
        id,
        source_id,
        reviewer_user_id,
        decision,
        reason,
        created_at
      ) values (
        ${randomUUID()}::uuid,
        ${input.sourceId}::uuid,
        ${input.reviewerUserId}::uuid,
        ${input.decision},
        ${input.reason},
        ${reviewedAt}
      )
    `;
  });

  return getPersonaSourceById(input.sourceId);
};

export const listSourceDocumentsBySourceIds = async (sourceIds: string[]) => {
  if (sourceIds.length === 0) {
    return [];
  }

  const sql = getSql();
  const rows = await sql.unsafe<SourceDocumentRow[]>(
    `select ${selectSourceDocumentColumns}
       from source_documents
      where source_id = any($1::uuid[])
      order by created_at asc`,
    [sourceIds],
  );
  return rows.map(mapSourceDocument);
};

export const listEvidenceSpansByDocumentIds = async (documentIds: string[]) => {
  if (documentIds.length === 0) {
    return [];
  }

  const sql = getSql();
  const rows = await sql.unsafe<EvidenceSpanRow[]>(
    `select ${selectEvidenceSpanColumns}
       from evidence_spans
      where document_id = any($1::uuid[])
      order by created_at asc`,
    [documentIds],
  );
  return rows.map(mapEvidenceSpan);
};

export const persistDynamicDistilledVersion = async (input: {
  personaId: string;
  actorUserId: string;
  profileJson: Record<string, unknown>;
  previewIntro: string;
  recommendedQuestions: string[];
  sampleAnswers: string[];
  coverageScore: number;
  groundingScore: number;
  styleScore: number;
  riskScore: number;
  fallbackQuestions: string[];
}) => {
  await ensureUserShadow(input.actorUserId);

  const versionId = await withTransaction(async (sql) => {
    const personaRows = await sql.unsafe<PersonaRow[]>(
      `select ${selectPersonaColumns} from personae where id = $1 and origin_type = 'USER'`,
      [input.personaId],
    );
    const persona = personaRows[0] ? mapPersona(personaRows[0]) : null;
    if (!persona) {
      return null;
    }

    const latestRows = await sql<{ latestVersionNumber: number | null }[]>`
      select max(version_number)::int as "latestVersionNumber"
      from persona_versions
      where persona_id = ${input.personaId}::uuid
    `;
    const latestVersionNumber = latestRows[0]?.latestVersionNumber ?? 0;

    const previousDraftId = persona.currentDraftVersionId;
    if (previousDraftId) {
      await sql`
        update persona_versions
           set status = 'SUPERSEDED',
               superseded_at = now()
         where id = ${previousDraftId}::uuid
           and status = 'DRAFT'
      `;
    }

    const approvedSources = await sql<{
      sourceId: string;
    }[]>`
      select id as "sourceId"
      from persona_sources
      where persona_id = ${input.personaId}::uuid
        and review_status != 'REJECTED'
      order by created_at asc
    `;
    const approvedSourceIds = approvedSources.map((row) => row.sourceId);
    const documents = approvedSourceIds.length
      ? await sql<{
          sourceId: string;
          documentId: string;
        }[]>`
          select
            source_id as "sourceId",
            id as "documentId"
          from source_documents
          where source_id = any(${approvedSourceIds}::uuid[])
        `
      : [];

    const versionId = randomUUID();
    const createdAt = new Date().toISOString();
    const currentDraftVersionRows = persona.currentDraftVersionId
      ? await sql.unsafe<PersonaVersionRow[]>(
          `select ${selectPersonaVersionColumns} from persona_versions where id = $1`,
          [persona.currentDraftVersionId],
        )
      : [];
    const currentDraftVersion = currentDraftVersionRows[0] ? mapPersonaVersion(currentDraftVersionRows[0]) : null;
    const distillFocus = currentDraftVersion?.distillFocus ?? ["观点"];

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
        created_by_user_id,
        submitted_for_publish_at,
        published_at,
        superseded_at,
        created_at
      ) values (
        ${versionId}::uuid,
        ${input.personaId}::uuid,
        ${latestVersionNumber + 1},
        ${"CANDIDATE"},
        ${sql.json(input.profileJson as JSONValue)},
        ${sql.json(distillFocus)},
        ${input.previewIntro},
        ${sql.json(input.recommendedQuestions.length > 0 ? input.recommendedQuestions : input.fallbackQuestions)},
        ${sql.json(input.sampleAnswers)},
        ${input.coverageScore},
        ${input.groundingScore},
        ${input.styleScore},
        ${input.riskScore},
        ${input.actorUserId}::uuid,
        null,
        null,
        null,
        ${createdAt}
      )
    `;

    for (const document of documents) {
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
          ${document.sourceId}::uuid,
          ${document.documentId}::uuid,
          ${createdAt}
        )
        on conflict (persona_version_id, source_id, document_id) do nothing
      `;
    }

    await sql`
      update personae
         set current_draft_version_id = ${versionId}::uuid,
             status = ${"READY"},
             updated_at = ${createdAt}
       where id = ${input.personaId}::uuid
    `;

    return versionId;
  });

  return versionId ? getDynamicVersionRow(versionId) : null;
};

export const submitDynamicPublishReview = async (versionId: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<PersonaVersionRow[]>(
    `update persona_versions
        set status = 'PENDING_PUBLISH_REVIEW',
            submitted_for_publish_at = now()
      where id = $1
      returning ${selectPersonaVersionColumns}`,
    [versionId],
  );
  return rows[0] ? mapPersonaVersion(rows[0]) : null;
};

export const publishDynamicPersonaVersion = async (input: {
  versionId: string;
  visibility: "PRIVATE" | "PUBLIC";
}) => {
  return withTransaction(async (sql) => {
    const versionRows = await sql.unsafe<PersonaVersionRow[]>(`select ${selectPersonaVersionColumns} from persona_versions where id = $1`, [
      input.versionId,
    ]);
    const version = versionRows[0] ? mapPersonaVersion(versionRows[0]) : null;
    if (!version) {
      return null;
    }

    const personaRows = await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1`, [version.personaId]);
    const persona = personaRows[0] ? mapPersona(personaRows[0]) : null;
    if (!persona) {
      return null;
    }

    const createdAt = new Date().toISOString();

    if (input.visibility === "PRIVATE") {
      if (version.status !== "CANDIDATE") {
        throw new Error("Only preview versions can be saved for private use");
      }

      await sql`
        update personae
           set current_draft_version_id = ${version.id}::uuid,
               status = 'READY',
               listing_status = 'PRIVATE',
               updated_at = ${createdAt}
         where id = ${persona.id}::uuid
      `;

      const updatedVersion = (await sql.unsafe<PersonaVersionRow[]>(
        `select ${selectPersonaVersionColumns} from persona_versions where id = $1`,
        [version.id],
      ))[0];
      const updatedPersona = (await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1`, [persona.id]))[0];

      return {
        version: mapPersonaVersion(updatedVersion!),
        persona: mapPersona(updatedPersona!),
        share: null,
      };
    }

    if (version.status !== "CANDIDATE" && version.status !== "PUBLISHED") {
      throw new Error("Only preview versions can be published");
    }

    if (persona.currentPublishedVersionId && persona.currentPublishedVersionId !== version.id) {
      await sql`
        update persona_versions
           set status = 'SUPERSEDED',
               superseded_at = ${createdAt}
         where id = ${persona.currentPublishedVersionId}::uuid
      `;
    }

    if (version.status !== "PUBLISHED") {
      await sql`
        update persona_versions
           set status = 'PUBLISHED',
               published_at = ${createdAt}
         where id = ${version.id}::uuid
      `;
    }

    await sql`
      update personae
         set current_draft_version_id = ${version.id}::uuid,
             current_published_version_id = ${version.id}::uuid,
             status = 'PUBLISHED',
             listing_status = 'UNLISTED',
             updated_at = ${createdAt}
       where id = ${persona.id}::uuid
    `;

    const updatedVersion = (await sql.unsafe<PersonaVersionRow[]>(
      `select ${selectPersonaVersionColumns} from persona_versions where id = $1`,
      [version.id],
    ))[0];
    const updatedPersona = (await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1`, [persona.id]))[0];
    const share = await ensurePrimaryShare(sql, {
      version: mapPersonaVersion(updatedVersion!),
      persona: mapPersona(updatedPersona!),
      createdAt,
    });

    return {
      version: mapPersonaVersion(updatedVersion!),
      persona: mapPersona(updatedPersona!),
      share,
    };
  });
};

export const listPendingDynamicPublishReviews = async () => {
  const sql = getSql();
  return sql<{
    personaVersionId: string;
    personaId: string;
    displayName: string;
    versionNumber: number;
    status: PersonaVersionRecord["status"];
    previewIntro: string | null;
    coverageScore: number | null;
    groundingScore: number | null;
    styleScore: number | null;
    riskScore: number | null;
    submittedForPublishAt: Date | null;
  }[]>`
    select
      v.id as "personaVersionId",
      v.persona_id as "personaId",
      p.display_name as "displayName",
      v.version_number as "versionNumber",
      v.status,
      v.preview_intro as "previewIntro",
      v.coverage_score as "coverageScore",
      v.grounding_score as "groundingScore",
      v.style_score as "styleScore",
      v.risk_score as "riskScore",
      v.submitted_for_publish_at as "submittedForPublishAt"
    from persona_versions v
    join personae p on p.id = v.persona_id
    where v.status = 'PENDING_PUBLISH_REVIEW'
      and p.origin_type = 'USER'
    order by v.submitted_for_publish_at asc nulls last, v.created_at asc
  `;
};

const buildUniqueShareSlug = async (sql: ReturnType<typeof getSql>, base: string, personaId: string, versionNumber: number) => {
  const personaSuffix = personaId.slice(0, 8).toLowerCase();
  const candidateBase = `${base}-${personaSuffix}-v${versionNumber}`;
  let candidate = candidateBase;
  let counter = 1;

  while (true) {
    const existing = await sql<{ exists: number }[]>`
      select 1 as exists from share_links where share_slug = ${candidate} limit 1
    `;
    if (existing.length === 0) {
      return candidate;
    }
    counter += 1;
    candidate = `${candidateBase}-${counter}`;
  }
};

const ensurePrimaryShare = async (sql: any, input: {
  version: PersonaVersionRecord;
  persona: PersonaRecord;
  createdAt: string;
}) => {
  const existing = (await sql.unsafe(
    `select ${selectShareColumns}
       from share_links
      where persona_version_id = $1
        and is_primary = true
      limit 1`,
    [input.version.id],
  )) as ShareRow[];
  if (existing[0]) {
    return mapShare(existing[0]);
  }

  const shareSlug = await buildUniqueShareSlug(sql, slugify(input.persona.displayName), input.persona.id, input.version.versionNumber);
  const shareId = randomUUID();
  await sql`
    insert into share_links (
      id,
      persona_version_id,
      share_slug,
      canonical_url,
      miniapp_path,
      channel_hint,
      is_primary,
      is_active,
      created_at
    ) values (
      ${shareId}::uuid,
      ${input.version.id}::uuid,
      ${shareSlug},
      ${createCanonicalUrl(shareSlug)},
      ${createMiniappPath(shareSlug)},
      ${"H5"},
      true,
      true,
      ${input.createdAt}
    )
  `;

  const created = (await sql.unsafe(`select ${selectShareColumns} from share_links where id = $1`, [shareId])) as ShareRow[];
  return mapShare(created[0]!);
};

export const reviewDynamicPublishRequest = async (input: {
  versionId: string;
  reviewerUserId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
}) => {
  await ensureUserShadow(input.reviewerUserId);

  const result = await withTransaction(async (sql) => {
    const versionRows = await sql.unsafe<PersonaVersionRow[]>(`select ${selectPersonaVersionColumns} from persona_versions where id = $1`, [
      input.versionId,
    ]);
    const version = versionRows[0] ? mapPersonaVersion(versionRows[0]) : null;
    if (!version) {
      return null;
    }

    const personaRows = await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1`, [version.personaId]);
    const persona = personaRows[0] ? mapPersona(personaRows[0]) : null;
    if (!persona) {
      return null;
    }

    const createdAt = new Date().toISOString();
    await sql`
      insert into persona_version_publish_reviews (
        id,
        persona_version_id,
        reviewer_user_id,
        decision,
        reason,
        created_at
      ) values (
        ${randomUUID()}::uuid,
        ${input.versionId}::uuid,
        ${input.reviewerUserId}::uuid,
        ${input.decision},
        ${input.reason},
        ${createdAt}
      )
    `;

    if (input.decision === "REJECTED") {
      await sql`
        update persona_versions
           set status = 'REJECTED'
         where id = ${input.versionId}::uuid
      `;
      await sql`
        update personae
           set status = 'REJECTED',
               updated_at = ${createdAt}
         where id = ${version.personaId}::uuid
      `;
      return {
        versionId: input.versionId,
        share: null,
      };
    }

    if (persona.currentPublishedVersionId) {
      await sql`
        update persona_versions
           set status = 'SUPERSEDED',
               superseded_at = ${createdAt}
         where id = ${persona.currentPublishedVersionId}::uuid
      `;
    }

    await sql`
      update persona_versions
         set status = 'PUBLISHED',
             published_at = ${createdAt}
       where id = ${input.versionId}::uuid
    `;
    await sql`
      update personae
         set current_published_version_id = ${input.versionId}::uuid,
             status = 'PUBLISHED',
             listing_status = 'UNLISTED',
             updated_at = ${createdAt}
       where id = ${version.personaId}::uuid
    `;

    const updatedVersionRows = await sql.unsafe<PersonaVersionRow[]>(
      `select ${selectPersonaVersionColumns} from persona_versions where id = $1`,
      [input.versionId],
    );
    const updatedPersonaRows = await sql.unsafe<PersonaRow[]>(`select ${selectPersonaColumns} from personae where id = $1`, [
      version.personaId,
    ]);
    const updatedVersion = mapPersonaVersion(updatedVersionRows[0]!);
    const updatedPersona = mapPersona(updatedPersonaRows[0]!);
    const share = await ensurePrimaryShare(sql, {
      version: updatedVersion,
      persona: updatedPersona,
      createdAt,
    });

    return {
      versionId: updatedVersion.id,
      share,
    };
  });

  if (!result) {
    return null;
  }

  return {
    version: (await getDynamicVersionRow(result.versionId))!,
    share: result.share,
  };
};

export const createDynamicShareForVersion = async (versionId: string) => {
  return withTransaction(async (sql) => {
    const version = await getDynamicVersionRow(versionId);
    if (!version) {
      return null;
    }
    if (version.status !== "PUBLISHED") {
      throw new Error("Only published versions can create shares");
    }

    const persona = await getDynamicPersonaRow(version.personaId);
    if (!persona) {
      return null;
    }

    return ensurePrimaryShare(sql, {
      version,
      persona,
      createdAt: new Date().toISOString(),
    });
  });
};

export const getDynamicShareLanding = async (shareSlug: string) => {
  const sql = getSql();
  const rows = await sql.unsafe<
    (ShareRow & {
      personaId: string;
      displayName: string;
      originType: "USER";
      versionId: string;
      versionNumber: number;
      previewIntro: string | null;
      recommendedQuestions: string[];
    })[]
  >(
    `select
      ${selectShareColumnsFromAlias("s")},
      p.id as "personaId",
      p.display_name as "displayName",
      p.origin_type as "originType",
      v.id as "versionId",
      v.version_number as "versionNumber",
      v.preview_intro as "previewIntro",
      v.recommended_questions as "recommendedQuestions"
     from share_links s
     join persona_versions v on v.id = s.persona_version_id
     join personae p on p.id = v.persona_id
     where s.share_slug = $1
       and s.is_active = true`,
    [shareSlug],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    share: mapShare(row),
    persona: {
      id: row.personaId,
      displayName: row.displayName,
      originType: row.originType,
    },
    version: {
      id: row.versionId,
      versionNumber: row.versionNumber,
      previewIntro: row.previewIntro,
      recommendedQuestions: Array.isArray(row.recommendedQuestions) ? row.recommendedQuestions : [],
    },
  };
};

export const resolveDynamicChatTarget = async (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  personaId?: string;
  personaVersionId?: string;
  shareSlug?: string;
}) => {
  switch (input.targetType) {
    case "published_persona": {
      const persona = input.personaId ? await getDynamicPersonaRow(input.personaId) : null;
      if (!persona?.currentPublishedVersionId) {
        return null;
      }
      return {
        kind: "dynamic" as const,
        personaId: persona.id,
        personaVersionId: persona.currentPublishedVersionId,
        shareSlug: null,
      };
    }
    case "draft_version_preview": {
      const version = input.personaVersionId ? await getDynamicVersionRow(input.personaVersionId) : null;
      if (!version) {
        return null;
      }
      return {
        kind: "dynamic" as const,
        personaId: version.personaId,
        personaVersionId: version.id,
        shareSlug: null,
      };
    }
    case "share_link": {
      const landing = input.shareSlug ? await getDynamicShareLanding(input.shareSlug) : null;
      if (!landing) {
        return null;
      }
      return {
        kind: "dynamic" as const,
        personaId: landing.persona.id,
        personaVersionId: landing.version.id,
        shareSlug: landing.share.shareSlug,
      };
    }
  }
};

export const addDynamicFeedback = async (input: {
  personaId: string;
  personaVersionId: string;
  chatMessageId?: string;
  feedbackKind: string;
  feedbackValue: string;
  createdByUserId?: string;
}) => {
  await ensureUserShadow(input.createdByUserId ?? null);
  const sql = getSql();
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  await sql`
    insert into persona_feedback (
      id,
      persona_id,
      persona_version_id,
      chat_message_id,
      feedback_kind,
      feedback_value,
      created_by_user_id,
      created_at
    ) values (
      ${id}::uuid,
      ${input.personaId}::uuid,
      ${input.personaVersionId}::uuid,
      ${input.chatMessageId ? `${input.chatMessageId}` : null}::uuid,
      ${input.feedbackKind},
      ${input.feedbackValue},
      ${input.createdByUserId ?? null}::uuid,
      ${createdAt}
    )
  `;
  const rows = await sql<{
    id: string;
    personaId: string;
    personaVersionId: string;
    chatMessageId: string | null;
    feedbackKind: string;
    feedbackValue: string;
    createdByUserId: string | null;
    createdAt: Date;
  }[]>`
    select
      id,
      persona_id as "personaId",
      persona_version_id as "personaVersionId",
      chat_message_id as "chatMessageId",
      feedback_kind as "feedbackKind",
      feedback_value as "feedbackValue",
      created_by_user_id as "createdByUserId",
      created_at as "createdAt"
    from persona_feedback
    where id = ${id}::uuid
  `;
  const row = rows[0]!;
  return {
    id: row.id,
    personaId: row.personaId,
    personaVersionId: row.personaVersionId,
    chatMessageId: row.chatMessageId,
    feedbackKind: row.feedbackKind,
    feedbackValue: row.feedbackValue,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt)!,
  };
};
