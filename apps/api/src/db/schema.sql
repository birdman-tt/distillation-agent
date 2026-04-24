CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
