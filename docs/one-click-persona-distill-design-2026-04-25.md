# One-click Persona Distill Design

Date: 2026-04-25

## Background

The current create flow is not the target product flow. It still works like a manual workbench:

1. User manually creates a persona.
2. User manually adds text or URL sources.
3. User clicks preview, which synchronously calls distill.
4. API calls worker and waits for a candidate persona version.

This is too heavy for normal users. The intended product flow is one-click distillation:

1. User enters a person or character name.
2. System checks whether usable public material exists.
3. System blocks politically risky or unsafe subjects.
4. System searches and shows candidate sources.
5. User can select sources and add extra material.
6. Background job creates a distilled persona version.
7. User enters preview chat.

## Goals

- Replace the current create flow with a guided one-click distill flow.
- Keep source confirmation in the loop before distillation starts.
- Generate a stable runtime prompt that can lead chat style.
- Use live web search during chat only when needed.
- Defer full local RAG to a later V2.

## Current State

Current reusable parts:

- `persona_versions.profile_json` stores structured persona profile JSON.
- `persona_sources` stores text and URL sources.
- `source_documents` and `evidence_spans` already exist as source-document primitives.
- `/v1/personae/:personaId/distill` already performs a synchronous distill.
- worker `/internal/distill` already runs the distill job.

Current gaps:

- No user-facing one-click distill flow.
- No source discovery API.
- No distill job table or job status API.
- No risk screening protocol for arbitrary user-entered subjects.
- No runtime prompt field in `profile_json`.
- `persona_chunks` exists in schema but is not currently populated or used.
- Chat runtime only uses a small part of `profileJson`, mainly `summary` and `topicStrengths`.

## Product Flow

### 1. Enter Subject

User enters a person or fictional character name.

The system normalizes the input into:

- `normalizedName`
- `entityType`: `REAL_PERSON | FICTIONAL_CHARACTER | UNKNOWN`
- `riskDecision`: `ALLOW | NEED_REVIEW | BLOCK`
- `coverageHint`: `ENOUGH | LOW | NONE`

### 2. Risk Screening

V1 uses a conservative policy.

Block by default:

- Political figures.
- Current sensitive public-event core figures.
- Strong ideology-driven subjects.
- Subjects mainly known for criminal or illegal controversies.
- Subjects where search results are dominated by unsafe or unverifiable claims.

Allow by default:

- Entrepreneurs.
- Creators.
- Public intellectuals.
- Fictional characters with enough public material.
- Historical figures with stable public material.

### 3. Source Discovery

If the subject is allowed, the system searches for candidate sources and shows them to the user.

Each source candidate should include:

- `sourceCandidateId`
- `title`
- `url`
- `publisher`
- `publishedAt`
- `snippet`
- `sourceKind`: `PRIMARY | SECONDARY | SUMMARY`
- `trustLevel`: `HIGH | MEDIUM | LOW`
- `recommended`: boolean

The UI should allow the user to:

- Select or unselect sources.
- Add URL sources.
- Paste text sources.
- Continue only when at least two usable sources are present.

### 4. Distill Job

After source confirmation, the system creates a distill job.

The job creates or updates a user persona, ingests selected sources, runs distill, and writes a candidate persona version.

### 5. Preview

When the job succeeds, the user is sent to preview chat for the generated version.

From preview, user can choose:

- Save for self.
- Public share.
- Return to add more sources.

## API Design

### Create Distill Intent

```http
POST /v1/persona-distill-intents
```

Request:

```json
{
  "query": "雷军"
}
```

Response:

```json
{
  "intentId": "uuid",
  "query": "雷军",
  "normalizedName": "雷军",
  "entityType": "REAL_PERSON",
  "riskDecision": "ALLOW",
  "coverageHint": "ENOUGH",
  "sourceCandidates": []
}
```

### Create Distill Job

```http
POST /v1/persona-distill-jobs
```

Request:

```json
{
  "intentId": "uuid",
  "selectedSourceIds": ["uuid"],
  "extraTextSources": [
    {
      "title": "访谈摘录",
      "content": "..."
    }
  ],
  "extraUrlSources": [
    {
      "url": "https://example.com/article",
      "title": "可选标题"
    }
  ]
}
```

Response:

```json
{
  "jobId": "uuid",
  "status": "QUEUED",
  "currentStep": "queued",
  "progress": 0
}
```

### Get Distill Job

```http
GET /v1/persona-distill-jobs/:jobId
```

Response:

```json
{
  "jobId": "uuid",
  "status": "DISTILLING",
  "currentStep": "building_runtime_prompt",
  "progress": 70,
  "personaId": "uuid",
  "resultVersionId": null,
  "error": null
}
```

Terminal success:

```json
{
  "jobId": "uuid",
  "status": "SUCCEEDED",
  "currentStep": "completed",
  "progress": 100,
  "personaId": "uuid",
  "resultVersionId": "uuid",
  "error": null
}
```

## Job Status Model

Statuses:

- `QUEUED`
- `SEARCHING`
- `WAITING_USER_SOURCES`
- `INGESTING`
- `DISTILLING`
- `SUCCEEDED`
- `FAILED`
- `BLOCKED`

Recommended job table:

```sql
CREATE TABLE persona_distill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  normalized_name TEXT,
  entity_type TEXT NOT NULL DEFAULT 'UNKNOWN',
  risk_decision TEXT NOT NULL DEFAULT 'ALLOW',
  coverage_hint TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  current_step TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  persona_id UUID REFERENCES personae(id) ON DELETE SET NULL,
  result_version_id UUID REFERENCES persona_versions(id) ON DELETE SET NULL,
  selected_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Distill Output

V1 should continue writing to `persona_versions`.

`profile_json` should keep the existing structured profile fields:

```json
{
  "summary": "...",
  "roles": [],
  "coreBeliefs": [],
  "reasoningPatterns": [],
  "speakingStyle": [],
  "signaturePhrases": [],
  "topicStrengths": [],
  "topicUnknowns": [],
  "taboosOrBoundaries": []
}
```

Add a runtime prompt section:

```json
{
  "runtimePrompt": {
    "version": "v1",
    "systemPersona": "...",
    "styleRules": [],
    "boundaries": [],
    "fallbackBehavior": []
  }
}
```

The runtime prompt is the stable chat control layer. It should not replace the structured profile; it should be derived from it.

## Chat Runtime With Live Search

V1 should add live search augmentation before full local RAG.

Flow:

1. User sends a message.
2. Minimax planner decides whether live search is needed.
3. If needed, backend searches public web sources.
4. Search results are normalized and filtered.
5. DeepSeek receives runtime prompt, profile summary, confirmed source summaries, recent chat memory, live search snippets, and current user message.
6. DeepSeek generates final persona reply.

Minimax should only plan retrieval. It should not generate the final answer.

Search planner output:

```json
{
  "shouldSearch": true,
  "reason": "User asks about recent events.",
  "queries": ["雷军 2026 最新 动态"],
  "riskDecision": "ALLOW"
}
```

Live search context:

```json
{
  "searchUsed": true,
  "queries": [],
  "results": [
    {
      "title": "...",
      "url": "...",
      "publisher": "...",
      "publishedAt": "...",
      "snippet": "...",
      "trustLevel": "HIGH"
    }
  ],
  "summaryForPrompt": "..."
}
```

Live search should trigger for:

- Recent, latest, current, this year, now.
- Specific facts not covered by local profile or source summaries.
- User challenges the factual basis of an answer.
- Company dynamics or public controversies.

Live search should not trigger for:

- Ordinary style chat.
- Emotional conversation.
- Questions already answerable from profile.
- High-risk political, medical, legal, financial operating advice.

## RAG Position

Full local RAG remains useful but should be V2.

V1:

- Store confirmed sources.
- Store source summaries.
- Generate runtime prompt.
- Use live search as temporary context.

V2:

- Populate `persona_chunks`.
- Add `search_persona_evidence` tool.
- Add rerank.
- Add citation/source grounding.
- Allow users to save useful live search results back into persona sources.

## Create Page Redesign

Current create page should be treated as not fit for the target product flow.

New create page stages:

1. Search subject.
2. Confirm sources.
3. Distill progress.
4. Preview chat.

The existing manual source workbench can remain as an advanced edit path, but it should not be the main user flow.

## Official Seed Replacement

Replace current 6 official objects with:

- 雷军
- 罗永浩
- 董宇辉
- 余承东
- 周鸿祎
- 于东来

These should be manually distilled by Codex first, not generated through the new product feature.

Each official seed should include:

- `persona`
- `version`
- `share`
- `profileJson`
- `runtimePrompt`
- `previewIntro`
- `recommendedQuestions`
- `sampleAnswers`
- `fallback replies`
- public source references

## Acceptance Criteria

- User can enter an allowed subject and see source candidates.
- User can confirm sources and start a distill job.
- Distill job can be polled until success or failure.
- Successful job creates a `CANDIDATE` persona version.
- User is taken to preview chat for the generated version.
- Blocked subjects do not create persona or sources.
- Live search is triggered only when planner says it is needed.
- Chat uses runtime prompt for style and live search only as factual augmentation.
- Current manual create flow is no longer the primary product path.
- New official 6 objects appear on home, detail, chat, and share pages.

## Open Questions

- Which search provider will be used in production?
- Should source candidates be cached globally by normalized subject?
- Should live search results be visible to users in chat, or only used internally?
- Should low-trust sources be hidden by default or shown as optional?
- Should virtual characters use the same risk and source policy as real people?
