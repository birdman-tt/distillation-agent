import { readFile } from "node:fs/promises";

import { listFeaturedPersonae } from "../seed/official-personae.js";
import { getSql } from "./client.js";

let bootstrapPromise: Promise<void> | null = null;

const schemaFileUrl = new URL("./schema.sql", import.meta.url);
const schemaSentinelTable = "persona_version_publish_reviews";
const readPublicWebBaseUrl = () => process.env.PUBLIC_WEB_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

const ensureChatMessageSearchSchema = async () => {
  const sql = getSql();
  await sql.unsafe(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS turn_index INTEGER;
  `);
  await sql.unsafe(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS message_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_messages'
          AND column_name = 'content_tsv'
      ) THEN
        ALTER TABLE chat_messages
          ADD COLUMN content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
      END IF;
    END $$;
  `);
  await sql.unsafe(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY chat_id
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM chat_messages
      WHERE turn_index IS NULL
    )
    UPDATE chat_messages AS messages
    SET turn_index = ranked.rn
    FROM ranked
    WHERE messages.id = ranked.id;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_chat_turn_idx
      ON chat_messages (chat_id, turn_index)
      WHERE turn_index IS NOT NULL;
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_messages_content_tsv_idx
      ON chat_messages USING GIN (content_tsv);
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_messages_chat_id_created_at_idx
      ON chat_messages (chat_id, created_at DESC);
  `);
};

const ensureChatTraceSchema = async () => {
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_turn_traces (
      turn_trace_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
      persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE RESTRICT,
      message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
      assistant_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
      capture_level TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      total_duration_ms INTEGER,
      trace_schema_version TEXT NOT NULL DEFAULT 'v1',
      chat_workflow_version TEXT NOT NULL DEFAULT 'v1',
      memory_search_version TEXT NOT NULL DEFAULT 'v1',
      prompt_template_version TEXT NOT NULL DEFAULT 'v1',
      normalization_version TEXT NOT NULL DEFAULT 'v1',
      model_provider TEXT,
      model_name TEXT,
      temperature DOUBLE PRECISION,
      max_tokens INTEGER,
      fallback_used BOOLEAN NOT NULL DEFAULT false,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_turn_traces_chat_id_started_at_idx
      ON chat_turn_traces (chat_id, started_at DESC);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_turn_trace_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turn_trace_id TEXT NOT NULL REFERENCES chat_turn_traces(turn_trace_id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      at TIMESTAMPTZ NOT NULL,
      duration_ms INTEGER,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      artifact_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (turn_trace_id, seq)
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_turn_trace_events_trace_seq_idx
      ON chat_turn_trace_events (turn_trace_id, seq);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_turn_trace_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turn_trace_id TEXT NOT NULL REFERENCES chat_turn_traces(turn_trace_id) ON DELETE CASCADE,
      artifact_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      storage_kind TEXT NOT NULL DEFAULT 'inline',
      text_value TEXT,
      json_value JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (turn_trace_id, artifact_key)
    );
  `);
};

const ensureChatRealtimeSchema = async () => {
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_realtime_presence (
      session_id TEXT PRIMARY KEY,
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_realtime_presence_chat_expires_idx
      ON chat_realtime_presence (chat_id, expires_at DESC);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_proactive_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      source_turn_trace_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      reason TEXT NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_proactive_jobs_due_idx
      ON chat_proactive_jobs (status, due_at ASC);
  `);
};

const ensureChatRetrievalSchema = async () => {
  const sql = getSql();
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_message_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      role message_role NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(1024) NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dimensions INTEGER NOT NULL DEFAULT 1024,
      turn_index INTEGER,
      embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (message_id, embedding_model),
      CONSTRAINT chat_message_embeddings_dimensions_check CHECK (embedding_dimensions = 1024)
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS chat_message_embeddings_chat_turn_idx
      ON chat_message_embeddings (chat_id, turn_index DESC NULLS LAST, embedded_at DESC);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_source_chunk_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      persona_id UUID NOT NULL REFERENCES personae(id) ON DELETE CASCADE,
      persona_version_id UUID REFERENCES persona_versions(id) ON DELETE CASCADE,
      persona_chunk_id UUID REFERENCES persona_chunks(id) ON DELETE CASCADE,
      source_id UUID REFERENCES persona_sources(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding VECTOR(1024) NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dimensions INTEGER NOT NULL DEFAULT 1024,
      embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT persona_source_chunk_embeddings_dimensions_check CHECK (embedding_dimensions = 1024)
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_source_chunk_embeddings_persona_version_idx
      ON persona_source_chunk_embeddings (persona_version_id, chunk_index);
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS persona_source_chunk_embeddings_unique_idx
      ON persona_source_chunk_embeddings (persona_version_id, source_id, chunk_index, embedding_model);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_profile_chunk_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(1024) NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dimensions INTEGER NOT NULL DEFAULT 1024,
      embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (persona_version_id, section, embedding_model),
      CONSTRAINT persona_profile_chunk_embeddings_dimensions_check CHECK (embedding_dimensions = 1024)
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_profile_chunk_embeddings_version_idx
      ON persona_profile_chunk_embeddings (persona_version_id, section);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS user_memory_facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      fact_type TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      source_message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (chat_id, fact_type, fact_value, source_message_id)
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS user_memory_facts_chat_type_active_idx
      ON user_memory_facts (chat_id, fact_type, updated_at DESC)
      WHERE is_active = true;
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS user_memory_facts_source_message_idx
      ON user_memory_facts (source_message_id);
  `);
};

const ensurePersonaDistillSchema = async () => {
  const sql = getSql();
  await sql.unsafe(`
    ALTER TABLE persona_versions
      ADD COLUMN IF NOT EXISTS source_distill_job_id UUID;
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_intents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      usage_intent TEXT NOT NULL,
      focus JSONB NOT NULL DEFAULT '[]'::jsonb,
      risk_decision TEXT NOT NULL,
      risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      coverage_hint TEXT NOT NULL,
      next_step TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_discoveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      intent_id UUID NOT NULL REFERENCES persona_distill_intents(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bucket_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
      missing_buckets JSONB NOT NULL DEFAULT '[]'::jsonb,
      quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      sanitizer_version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_source_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discovery_id UUID NOT NULL REFERENCES persona_distill_discoveries(id) ON DELETE CASCADE,
      bucket TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      normalized_url_hash TEXT,
      publisher TEXT,
      author TEXT,
      published_at TEXT,
      snippet TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      trust_level TEXT NOT NULL,
      source_category TEXT NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      recommended BOOLEAN NOT NULL DEFAULT false,
      recommendation_reason TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      extra_source_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_extra_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discovery_id UUID NOT NULL REFERENCES persona_distill_discoveries(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input_type TEXT NOT NULL,
      title TEXT,
      url TEXT,
      content TEXT,
      source_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      rejection_reason TEXT,
      source_candidate_id UUID REFERENCES persona_distill_source_candidates(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      intent_id UUID NOT NULL REFERENCES persona_distill_intents(id) ON DELETE RESTRICT,
      discovery_id UUID NOT NULL REFERENCES persona_distill_discoveries(id) ON DELETE RESTRICT,
      persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
      result_version_id UUID REFERENCES persona_versions(id) ON DELETE SET NULL,
      query TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      risk_decision TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      selected_source_candidate_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      selected_extra_source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      quality_scores_json JSONB,
      missing_requirements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      claimed_by_worker_id TEXT,
      claimed_at TIMESTAMPTZ,
      heartbeat_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_jobs_status_created_idx
      ON persona_distill_jobs (status, created_at ASC);
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_jobs_creator_updated_idx
      ON persona_distill_jobs (created_by_user_id, updated_at DESC);
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS owned_persona_objects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
      active_persona_version_id UUID REFERENCES persona_versions(id) ON DELETE SET NULL,
      source_distill_job_id UUID REFERENCES persona_distill_jobs(id) ON DELETE SET NULL,
      display_name TEXT NOT NULL,
      intro TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS owned_persona_objects_owner_updated_idx
      ON owned_persona_objects (owner_user_id, updated_at DESC)
      WHERE deleted_at IS NULL;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS owned_persona_objects_owner_persona_active_idx
      ON owned_persona_objects (owner_user_id, persona_id)
      WHERE persona_id IS NOT NULL AND deleted_at IS NULL;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS owned_persona_objects_source_job_active_idx
      ON owned_persona_objects (source_distill_job_id)
      WHERE source_distill_job_id IS NOT NULL AND deleted_at IS NULL;
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS owned_persona_objects_active_version_idx
      ON owned_persona_objects (active_persona_version_id)
      WHERE active_persona_version_id IS NOT NULL AND deleted_at IS NULL;
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES persona_distill_jobs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      artifact_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS persona_distill_tool_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES persona_distill_jobs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      runtime_state_before TEXT NOT NULL,
      runtime_state_after TEXT,
      input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      error_message TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
  `);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS persona_distill_tool_runs_job_seq_idx
      ON persona_distill_tool_runs (job_id, seq);
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS persona_distill_tool_runs_job_started_idx
      ON persona_distill_tool_runs (job_id, started_at ASC);
  `);
};

export const backfillOwnedPersonaObjects = async () => {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      insert into owned_persona_objects (
        owner_user_id,
        persona_id,
        active_persona_version_id,
        source_distill_job_id,
        display_name,
        intro,
        status,
        created_at,
        updated_at
      )
      select
        p.creator_user_id,
        p.id,
        coalesce(p.current_published_version_id, p.current_draft_version_id, latest_candidate.id),
        latest_job.id,
        p.display_name,
        coalesce(active_version.preview_intro, latest_candidate.preview_intro),
        case
          when latest_job.id is not null
            and latest_job.updated_at > greatest(
              coalesce(active_version.created_at, 'epoch'::timestamptz),
              coalesce(latest_candidate.created_at, 'epoch'::timestamptz)
            )
            then case
              when latest_job.status in ('NEEDS_MORE_SOURCES', 'BLOCKED') then 'NEEDS_SOURCES'
              when latest_job.status = 'FAILED' then 'FAILED'
              else 'CREATING'
            end
          when latest_candidate.id is not null
            and latest_candidate.created_at > coalesce(active_version.created_at, 'epoch'::timestamptz)
            then 'PENDING_CONFIRM'
          when p.current_published_version_id is not null then 'PUBLIC'
          when p.current_draft_version_id is not null then 'READY'
          when latest_candidate.id is not null then 'PENDING_CONFIRM'
          when latest_job.status in ('NEEDS_MORE_SOURCES', 'BLOCKED') then 'NEEDS_SOURCES'
          when latest_job.status = 'FAILED' then 'FAILED'
          else 'CREATING'
        end,
        p.created_at,
        greatest(
          p.updated_at,
          coalesce(active_version.created_at, p.updated_at),
          coalesce(latest_candidate.created_at, p.updated_at),
          coalesce(latest_job.updated_at, p.updated_at)
        )
      from personae p
      left join lateral (
        select *
        from persona_versions v
        where v.id = coalesce(p.current_published_version_id, p.current_draft_version_id)
        limit 1
      ) active_version on true
      left join lateral (
        select *
        from persona_versions v
        where v.persona_id = p.id
          and v.status = 'CANDIDATE'
          and p.current_draft_version_id is distinct from v.id
          and p.current_published_version_id is distinct from v.id
        order by v.created_at desc
        limit 1
      ) latest_candidate on true
      left join lateral (
        select *
        from persona_distill_jobs j
        where j.created_by_user_id = p.creator_user_id
          and j.persona_id = p.id
          and j.status in ('QUEUED', 'CLAIMED', 'INGESTING', 'EXTRACTING', 'SYNTHESIZING', 'VALIDATING', 'PERSISTING', 'NEEDS_MORE_SOURCES', 'FAILED', 'BLOCKED')
        order by j.updated_at desc
        limit 1
      ) latest_job on true
      where p.creator_user_id is not null
        and p.origin_type = 'USER'
        and not exists (
          select 1
          from owned_persona_objects existing
          where existing.owner_user_id = p.creator_user_id
            and existing.persona_id = p.id
            and existing.deleted_at is null
        )
    `;

    await tx`
      insert into owned_persona_objects (
        owner_user_id,
        persona_id,
        active_persona_version_id,
        source_distill_job_id,
        display_name,
        intro,
        status,
        created_at,
        updated_at
      )
      select
        j.created_by_user_id,
        j.persona_id,
        j.result_version_id,
        j.id,
        j.normalized_name,
        v.preview_intro,
        case
          when j.status in ('NEEDS_MORE_SOURCES', 'BLOCKED') then 'NEEDS_SOURCES'
          when j.status = 'FAILED' then 'FAILED'
          when j.status = 'SUCCEEDED' and v.id is not null then 'PENDING_CONFIRM'
          else 'CREATING'
        end,
        j.created_at,
        j.updated_at
      from persona_distill_jobs j
      left join persona_versions v on v.id = j.result_version_id
      where j.persona_id is not null
        and j.status in ('QUEUED', 'CLAIMED', 'INGESTING', 'EXTRACTING', 'SYNTHESIZING', 'VALIDATING', 'PERSISTING', 'NEEDS_MORE_SOURCES', 'FAILED', 'BLOCKED', 'SUCCEEDED')
        and not exists (
          select 1
          from owned_persona_objects existing
          where existing.source_distill_job_id = j.id
            and existing.deleted_at is null
        )
        and not exists (
          select 1
          from owned_persona_objects existing
          where existing.owner_user_id = j.created_by_user_id
            and existing.persona_id = j.persona_id
            and existing.deleted_at is null
        )
    `;
  });
};

const syncOfficialSeedShadows = async () => {
  const sql = getSql();
  const seeds = listFeaturedPersonae();

  for (const seed of seeds) {
    await sql.begin(async (tx) => {
      await tx`
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
          ${seed.persona.id}::uuid,
          ${seed.persona.displayName},
          ${seed.persona.originType},
          ${seed.persona.personaType},
          ${seed.persona.listingStatus},
          ${seed.persona.status},
          null,
          ${seed.persona.featuredRank},
          null,
          null,
          now(),
          now()
        )
        on conflict (id) do update
          set display_name = excluded.display_name,
              origin_type = excluded.origin_type,
              persona_type = excluded.persona_type,
              listing_status = excluded.listing_status,
              status = excluded.status,
              featured_rank = excluded.featured_rank,
              updated_at = now()
      `;

      await tx`
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
          ${seed.version.id}::uuid,
          ${seed.persona.id}::uuid,
          ${seed.version.versionNumber},
          'PUBLISHED',
          ${tx.json(seed.version.profileJson)},
          '[]'::jsonb,
          ${seed.version.previewIntro},
          ${tx.json(seed.version.recommendedQuestions)},
          ${tx.json(seed.version.sampleAnswers)},
          100,
          100,
          100,
          0,
          null,
          now(),
          now(),
          null,
          now()
        )
        on conflict (id) do update
          set persona_id = excluded.persona_id,
              version_number = excluded.version_number,
              status = excluded.status,
              profile_json = excluded.profile_json,
              preview_intro = excluded.preview_intro,
              recommended_questions = excluded.recommended_questions,
              sample_answers = excluded.sample_answers,
              coverage_score = excluded.coverage_score,
              grounding_score = excluded.grounding_score,
              style_score = excluded.style_score,
              risk_score = excluded.risk_score,
              submitted_for_publish_at = excluded.submitted_for_publish_at,
              published_at = excluded.published_at
      `;

      await tx`
        update personae
        set current_published_version_id = ${seed.version.id}::uuid,
            updated_at = now()
        where id = ${seed.persona.id}::uuid
      `;

      await tx`
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
          ${seed.share.id}::uuid,
          ${seed.version.id}::uuid,
          ${seed.share.shareSlug},
          ${`${readPublicWebBaseUrl()}/share/${seed.share.shareSlug}`},
          ${`/pages/share/index?slug=${encodeURIComponent(seed.share.shareSlug)}`},
          'H5',
          true,
          true,
          now()
        )
        on conflict (id) do update
          set persona_version_id = excluded.persona_version_id,
              share_slug = excluded.share_slug,
              canonical_url = excluded.canonical_url,
              miniapp_path = excluded.miniapp_path,
              channel_hint = excluded.channel_hint,
              is_primary = excluded.is_primary,
              is_active = excluded.is_active
      `;
    });
  }
};

export const resetDatabaseBootstrapForTests = () => {
  bootstrapPromise = null;
};

export const ensureDatabaseSchema = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const sql = getSql();
      const existing = await sql<{ exists: string | null }[]>`
        select to_regclass(${`public.${schemaSentinelTable}`}) as exists
      `;

      if (!existing[0]?.exists) {
        const schemaSql = await readFile(schemaFileUrl, "utf8");
        await sql.unsafe(schemaSql);
      }

      await syncOfficialSeedShadows();
      await ensureChatMessageSearchSchema();
      await ensureChatTraceSchema();
      await ensureChatRealtimeSchema();
      await ensureChatRetrievalSchema();
      await ensurePersonaDistillSchema();
      await backfillOwnedPersonaObjects();
    })();
  }

  return bootstrapPromise;
};
