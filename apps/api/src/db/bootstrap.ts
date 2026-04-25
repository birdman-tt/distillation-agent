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
    })();
  }

  return bootstrapPromise;
};
