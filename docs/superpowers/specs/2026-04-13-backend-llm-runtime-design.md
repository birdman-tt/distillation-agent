# Hall of Fame Backend LLM Runtime Design

- Date: 2026-04-13
- Status: discussed, awaiting review
- Scope: backend LLM framework choice and runtime boundaries for distillation and chat
- Based on:
  - `docs/technical-architecture.md`
  - `docs/implementation-plan.md`
  - current discussion decisions

## 1. Summary

This project should use:

- `Fastify + TypeScript + zod` as the business backend
- `Mastra` as the internal LLM workflow/runtime layer
- `workflow-first` for production paths
- `agent` only for internal auxiliary tasks
- `DeepSeek` as the single provider for generative models
- local retrieval in V1, not a hosted embedding dependency

Confirmed decisions from discussion:

- Framework choice: `Mastra`, not `Dify`
- Integration mode: embed Mastra inside the existing `Fastify + worker` codebase
- Provider choice: `DeepSeek`
- Distill model: `deepseek-reasoner`
- Chat model: `deepseek-chat`
- Review gate: manual review stays in business backend, not in Mastra agent state
- Chat mode: single-pass generation, not multi-pass rewrite
- Classification mode: `rule-first`, with model fallback only when needed

## 2. Final Recommendation

The production backend should not be built as an `agent-first` system.

It should be built as:

- business truth in `Fastify + PostgreSQL + Redis`
- LLM orchestration in `Mastra workflows`
- strict schema validation around every LLM boundary

In one sentence:

`Business state stays in our backend; Mastra only orchestrates LLM steps inside deterministic workflows.`

## 3. Why Mastra Instead of Dify

### 3.1 Mastra fits the current stack better

The project has already converged on:

- `Fastify`
- `TypeScript`
- `zod`
- a monorepo structure with `apps/api`, `apps/worker`, and shared packages

Mastra is better aligned with a code-first TypeScript backend. It can be embedded as an internal runtime layer without introducing a second product control plane.

### 3.2 Dify is stronger for fast app prototyping, not for this system's source of truth

Dify is good when the main goal is:

- visually building LLM apps quickly
- publishing chatflows or workflows as APIs
- letting product or ops iterate on prompts in a hosted-style console

That is not the main constraint here.

The hard part of this project is:

- persona versioning
- source review status
- publish rules
- share identity stability
- chat grounding semantics

These are business invariants and should remain in our own code and database.

### 3.3 This project values auditability and determinism over autonomous flexibility

The core product path needs:

- reproducible distillation runs
- replayable failures
- stable output schema
- clear review boundaries
- fixed publish/share semantics

That favors explicit workflows over autonomous agents.

## 4. Workflow vs Agent Review

### 4.1 Source ingestion and cleaning

Decision: `workflow`

Reason:

- the steps are known in advance
- ordering is fixed
- retries are mechanical
- output needs to be persisted and traceable

Typical sequence:

1. receive source
2. fetch or normalize content
3. extract metadata
4. write `persona_sources`
5. set `PENDING_REVIEW`

### 4.2 Manual review

Decision: business backend, not workflow-owned agent state

Reason:

- review changes business truth
- review status gates distillation and publishing
- audit requirements belong in our backend

Mastra may be used to produce review hints, but it must not own the final review decision.

### 4.3 Distillation

Decision: `workflow`

Reason:

- the distillation graph is known
- every step has a fixed input/output contract
- the run must be replayable
- version creation must be explicit

Distillation is not an open-ended research problem in production. It is a controlled transformation pipeline.

### 4.4 Chat runtime

Decision: `workflow`, not `agent`

Reason:

- the response path is already defined
- retrieval only hits approved evidence from the current persona version
- the system must output a fixed schema
- the product needs low latency and stable behavior

Chat should be:

1. classify question
2. retrieve evidence
3. judge answer mode
4. generate once
5. validate
6. persist

This is not a good use case for agent loops or tool autonomy.

### 4.5 Publish and share

Decision: business backend only

Reason:

- `persona_version` is immutable business state
- `share_slug` uniqueness is a database concern
- publish gating is policy logic, not LLM reasoning

### 4.6 Auxiliary research and ops tasks

Decision: `agent` is acceptable here

Examples:

- finding candidate public sources
- suggesting review risks
- generating ops recommendations
- analyzing failed conversations
- internal prompt red-team experiments

These tasks are open-ended and human-reviewed, so agent flexibility is useful there.

## 5. Ownership Boundary

### 5.1 Fastify business backend owns

- `users`
- `auth_identities`
- `sessions`
- `personae`
- `persona_versions`
- `persona_sources`
- `persona_chunks`
- `chats`
- `chat_messages`
- `share_links`
- `persona_feedback`
- `current_draft_version_id`
- `current_published_version_id`
- review status and publish status transitions
- token lifecycle
- rate limiting
- audit logs
- share slug generation

### 5.2 Mastra owns

- LLM step orchestration
- prompt execution
- structured output parsing
- workflow traces
- model-level metrics
- eval runs

Mastra does not own the business truth of the system.

## 6. Model Strategy

Use `DeepSeek` as the single provider for generative model calls:

- `deepseek-reasoner`
  - extraction
  - summarization
  - structured persona profiling
  - offline distillation workflow
- `deepseek-chat`
  - grounded or inferred response generation
  - stable structured output
  - style control under hard constraints
  - online single-pass chat replies

For retrieval in V1:

- do not depend on a hosted embedding API
- use local full-text retrieval plus metadata filters
- add trigram or keyword-based recall where needed

This preserves the single-provider constraint without forcing in a second model vendor.

## 7. Production Workflows

### 7.1 distillPersonaWorkflow

Purpose:

- turn approved sources into a draft persona version payload

Recommended steps:

1. `loadApprovedSources`
2. `normalizeAndDeduplicate`
3. `chunkAndIndex`
4. `extractPersonaProfile`
5. `generatePreviewQA`
6. `scoreQuality`
7. `persistDraftVersion`

Expected outputs:

- `persona_profile.json`
- preview intro
- recommended questions
- sample answers
- quality scores
- draft version snapshot

### 7.2 chatReplyWorkflow

Purpose:

- generate one controlled answer for one message against one fixed persona version

Confirmed chat mode:

- single-pass generation only

Recommended steps:

1. `loadPersonaVersion`
2. `classifyQuestion`
3. `retrieveEvidence`
4. `judgeInferenceLevel`
5. `generateAnswer`
6. `validateAndPersist`

Required output contract:

- `answer`
- `basis`
- `basisSummary`
- `inferenceLevel`
- `conflictDetected`
- `refusalReason`

## 8. Why Chat Should Be Single-Pass

We explicitly choose single-pass generation instead of a rewrite loop.

Reason:

- inference mode is already judged outside the model
- replayability is easier
- latency is lower
- prompt behavior is easier to debug
- failure handling is simpler

If the output is invalid:

- retry once with the same schema constraints
- then fall back to a safe refusal response

Do not add a hidden second creative pass in V1.

## 9. What Must Not Be Delegated to Agents

The following must remain deterministic and code-controlled:

- source review state transition
- persona publish decision
- share generation
- immutable version creation
- refusal reason enum semantics
- inference level semantics
- database writes as business truth

Agents may assist humans, but agents must not define production truth.

## 10. Minimal Next-Step Design Implications

This decision implies the future code layout should likely look like:

- `apps/api`
  - routes
  - business services
  - DB state transitions
- `apps/worker`
  - workflow entrypoints
  - queue consumers
- `packages/contracts`
  - zod request/response schemas
- `packages/domain`
  - enums and state machines
- `packages/prompt-kit`
  - prompt builders
  - structured output schemas
  - workflow step prompt contracts

## 11. Open Questions

These are still undecided and should be answered before implementation planning:

- what exact quality score thresholds block publishing
- whether internal operator tools need a lightweight agent mode in V1

## 12. Final Decision Snapshot

For V1:

- choose `Mastra`
- embed it inside the existing backend/worker codebase
- choose `DeepSeek`
- use `deepseek-reasoner` for distillation
- use `deepseek-chat` for online replies
- use `workflow-first`
- use `single-pass chat generation`
- use `rule-first` classification
- use local retrieval in V1 instead of hosted embeddings
- keep review, publish, share, and version truth in our own backend
- allow `agent` only for non-production auxiliary tasks
