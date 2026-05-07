CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE auth_provider AS ENUM ('ANONYMOUS', 'WEB_SMS', 'WECHAT_MINIAPP');
CREATE TYPE persona_origin_type AS ENUM ('OFFICIAL', 'USER');
CREATE TYPE persona_type AS ENUM ('HISTORICAL_FIGURE', 'AUTHOR_OR_BLOGGER', 'ORIGINAL_PERSONA');
CREATE TYPE persona_listing_status AS ENUM ('PRIVATE', 'UNLISTED', 'FEATURED', 'REMOVED');
CREATE TYPE persona_status AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'REJECTED');
CREATE TYPE persona_version_status AS ENUM ('DRAFT', 'CANDIDATE', 'PENDING_PUBLISH_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'REJECTED');
CREATE TYPE source_input_type AS ENUM ('TEXT', 'URL', 'OFFICIAL_SEED');
CREATE TYPE source_review_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE source_kind AS ENUM ('PRIMARY', 'SECONDARY', 'SUMMARY');
CREATE TYPE share_channel_hint AS ENUM ('H5', 'WECHAT_IN_APP', 'WECHAT_SHARE_CARD');
CREATE TYPE chat_target_type AS ENUM ('published_persona', 'draft_version_preview', 'share_link');
CREATE TYPE message_role AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');
CREATE TYPE inference_level AS ENUM ('grounded', 'inferred', 'insufficient_evidence');
CREATE TYPE refusal_reason AS ENUM ('none', 'high_risk', 'policy_blocked', 'insufficient_evidence', 'conflicting_evidence', 'out_of_scope');
CREATE TYPE review_decision AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider auth_provider NOT NULL,
  provider_subject TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  anonymous_session_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE personae (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  origin_type persona_origin_type NOT NULL,
  persona_type persona_type NOT NULL,
  listing_status persona_listing_status NOT NULL DEFAULT 'PRIVATE',
  status persona_status NOT NULL DEFAULT 'DRAFT',
  creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  featured_rank INTEGER,
  current_draft_version_id UUID,
  current_published_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personae(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status persona_version_status NOT NULL DEFAULT 'DRAFT',
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  distill_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_intro TEXT,
  recommended_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_score INTEGER,
  grounding_score INTEGER,
  style_score INTEGER,
  risk_score INTEGER,
  source_distill_job_id UUID,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_for_publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (persona_id, version_number)
);

ALTER TABLE personae
  ADD CONSTRAINT personae_current_draft_version_fk
    FOREIGN KEY (current_draft_version_id) REFERENCES persona_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT personae_current_published_version_fk
    FOREIGN KEY (current_published_version_id) REFERENCES persona_versions(id) ON DELETE SET NULL;

CREATE TABLE persona_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personae(id) ON DELETE CASCADE,
  input_type source_input_type NOT NULL,
  review_status source_review_status NOT NULL DEFAULT 'PENDING_REVIEW',
  source_url TEXT,
  source_title TEXT,
  source_author TEXT,
  source_summary TEXT,
  source_kind source_kind NOT NULL DEFAULT 'SUMMARY',
  source_published_at TIMESTAMPTZ,
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  normalized_url TEXT,
  normalized_url_hash TEXT,
  trust_score INTEGER,
  review_reason TEXT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES persona_sources(id) ON DELETE CASCADE,
  title TEXT,
  author TEXT,
  url TEXT,
  normalized_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fetch_status_code INTEGER,
  fetch_error TEXT,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  section_label TEXT,
  span_start INTEGER NOT NULL,
  span_end INTEGER NOT NULL,
  normalized_quote TEXT NOT NULL,
  source_kind source_kind NOT NULL,
  trust_score INTEGER,
  dedupe_group_id UUID,
  conflict_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personae(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  primary_span_id UUID REFERENCES evidence_spans(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_tsv TSVECTOR,
  keyword_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX persona_chunks_chunk_tsv_idx ON persona_chunks USING GIN (chunk_tsv);

CREATE TABLE persona_version_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES persona_sources(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (persona_version_id, source_id, document_id)
);

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  share_slug TEXT NOT NULL UNIQUE,
  canonical_url TEXT NOT NULL,
  miniapp_path TEXT NOT NULL,
  channel_hint share_channel_hint NOT NULL DEFAULT 'H5',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX share_links_primary_version_idx
  ON share_links (persona_version_id)
  WHERE is_primary = true;

CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type chat_target_type NOT NULL,
  target_persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
  target_persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE RESTRICT,
  share_link_id UUID REFERENCES share_links(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_from_share BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  turn_index INTEGER,
  content TEXT NOT NULL,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED,
  basis JSONB,
  basis_summary JSONB,
  inference_level inference_level,
  conflict_detected BOOLEAN,
  refusal_reason refusal_reason,
  message_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX chat_messages_chat_turn_idx
  ON chat_messages (chat_id, turn_index)
  WHERE turn_index IS NOT NULL;

CREATE INDEX chat_messages_content_tsv_idx ON chat_messages USING GIN (content_tsv);
CREATE INDEX chat_messages_chat_id_created_at_idx ON chat_messages (chat_id, created_at DESC);

CREATE TABLE chat_message_embeddings (
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

CREATE INDEX chat_message_embeddings_chat_turn_idx
  ON chat_message_embeddings (chat_id, turn_index DESC NULLS LAST, embedded_at DESC);

CREATE TABLE persona_source_chunk_embeddings (
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

CREATE INDEX persona_source_chunk_embeddings_persona_version_idx
  ON persona_source_chunk_embeddings (persona_version_id, chunk_index);

CREATE UNIQUE INDEX persona_source_chunk_embeddings_unique_idx
  ON persona_source_chunk_embeddings (persona_version_id, source_id, chunk_index, embedding_model);

CREATE TABLE persona_profile_chunk_embeddings (
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

CREATE INDEX persona_profile_chunk_embeddings_version_idx
  ON persona_profile_chunk_embeddings (persona_version_id, section);

CREATE TABLE user_memory_facts (
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

CREATE INDEX user_memory_facts_chat_type_active_idx
  ON user_memory_facts (chat_id, fact_type, updated_at DESC)
  WHERE is_active = true;

CREATE INDEX user_memory_facts_source_message_idx
  ON user_memory_facts (source_message_id);

CREATE TABLE chat_realtime_presence (
  session_id TEXT PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX chat_realtime_presence_chat_expires_idx
  ON chat_realtime_presence (chat_id, expires_at DESC);

CREATE TABLE chat_proactive_jobs (
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

CREATE INDEX chat_proactive_jobs_due_idx
  ON chat_proactive_jobs (status, due_at ASC);

CREATE TABLE chat_turn_traces (
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
  trace_schema_version TEXT NOT NULL,
  chat_workflow_version TEXT NOT NULL,
  memory_search_version TEXT NOT NULL,
  prompt_template_version TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  temperature DOUBLE PRECISION,
  max_tokens INTEGER,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_turn_traces_chat_id_started_at_idx
  ON chat_turn_traces (chat_id, started_at DESC);

CREATE TABLE chat_turn_trace_events (
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

CREATE INDEX chat_turn_trace_events_trace_seq_idx
  ON chat_turn_trace_events (turn_trace_id, seq);

CREATE TABLE chat_turn_trace_artifacts (
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

CREATE TABLE persona_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personae(id) ON DELETE CASCADE,
  persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  feedback_kind TEXT NOT NULL,
  feedback_value TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES persona_sources(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision review_decision NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_version_publish_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_version_id UUID NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision review_decision NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_distill_intents (
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

CREATE TABLE persona_distill_discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES persona_distill_intents(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_buckets JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  sanitizer_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_distill_source_discovery_jobs (
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

CREATE INDEX persona_distill_source_discovery_jobs_status_due_idx
  ON persona_distill_source_discovery_jobs (status, next_run_at ASC, created_at ASC);

CREATE INDEX persona_distill_source_discovery_jobs_creator_updated_idx
  ON persona_distill_source_discovery_jobs (created_by_user_id, updated_at DESC);

CREATE INDEX persona_distill_source_discovery_jobs_status_heartbeat_idx
  ON persona_distill_source_discovery_jobs (status, heartbeat_at ASC);

CREATE TABLE persona_distill_source_candidates (
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

CREATE TABLE persona_distill_extra_sources (
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

CREATE TABLE persona_distill_jobs (
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

CREATE INDEX persona_distill_jobs_status_created_idx ON persona_distill_jobs (status, created_at ASC);
CREATE INDEX persona_distill_jobs_creator_updated_idx ON persona_distill_jobs (created_by_user_id, updated_at DESC);

CREATE TABLE owned_persona_objects (
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

CREATE INDEX owned_persona_objects_owner_updated_idx
  ON owned_persona_objects (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX owned_persona_objects_owner_persona_active_idx
  ON owned_persona_objects (owner_user_id, persona_id)
  WHERE persona_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX owned_persona_objects_source_job_active_idx
  ON owned_persona_objects (source_distill_job_id)
  WHERE source_distill_job_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX owned_persona_objects_active_version_idx
  ON owned_persona_objects (active_persona_version_id)
  WHERE active_persona_version_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE persona_distill_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES persona_distill_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  artifact_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE persona_distill_tool_runs (
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

CREATE UNIQUE INDEX persona_distill_tool_runs_job_seq_idx
  ON persona_distill_tool_runs (job_id, seq);

CREATE INDEX persona_distill_tool_runs_job_started_idx
  ON persona_distill_tool_runs (job_id, started_at ASC);
