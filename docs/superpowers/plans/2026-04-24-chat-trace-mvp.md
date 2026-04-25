# Chat Trace MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-first chat trace system that exposes `x-turn-trace-id`, records the message lifecycle, persists trace data, and provides internal read APIs for debugging.

**Architecture:** Keep trace capture inside `apps/api` as a request-scoped collector. Emit structured stdout immediately, buffer events/artifacts in memory during the request, and best-effort flush a trace summary plus ordered events to PostgreSQL when the turn completes. Expose read-only internal endpoints from the same API process so no new deployment unit is required.

**Tech Stack:** Fastify, postgres.js, Node test runner, Zod, existing Hall of Fame API routes and chat workflow.

---

### Task 1: Define Storage and Contract Boundaries

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/bootstrap.ts`
- Create: `packages/contracts/src/chat-traces.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] Add trace tables and indexes for summary rows, ordered events, and inline artifacts.
- [ ] Add bootstrap guards so existing databases get the trace schema without wiping current data.
- [ ] Define Zod schemas for trace summaries, event payloads, artifact payloads, and list responses.

### Task 2: Add Failing Integration Tests

**Files:**
- Create: `apps/api/src/chat-trace.test.ts`

- [ ] Write a failing test that posts a chat message and expects `x-turn-trace-id` in the response.
- [ ] Write a failing test that fetches `/internal/debug/chat-traces/:turnTraceId` and expects the persisted waterfall plus prompt/model artifacts.
- [ ] Write a failing test that lists traces by `chatId`.

### Task 3: Implement Trace Persistence

**Files:**
- Create: `apps/api/src/observability/chat-trace/types.ts`
- Create: `apps/api/src/observability/chat-trace/config.ts`
- Create: `apps/api/src/observability/chat-trace/collector.ts`
- Create: `apps/api/src/observability/chat-trace/repository.ts`

- [ ] Add a request-scoped collector that can append ordered events, attach inline artifacts, and produce a summary snapshot.
- [ ] Add repository functions to write trace batches and read them back by `turnTraceId` or `chatId`.
- [ ] Keep flush best-effort so trace errors do not fail the chat response.

### Task 4: Instrument the Chat Flow

**Files:**
- Modify: `apps/api/src/routes/chats.ts`
- Modify: `apps/api/src/services/chat-memory/assemble-chat-context.ts`
- Modify: `apps/api/src/workflows/chat/run-chat-workflow.ts`
- Modify: `packages/deepseek-client/src/index.ts`

- [ ] Generate `turn_trace_id` for each message request and return it in `x-turn-trace-id`.
- [ ] Record route-level events for receive, user-message persistence, context assembly, assistant persistence, completion, and failures.
- [ ] Surface memory-search diagnostics from `assembleChatContext` so they can be logged into the trace.
- [ ] Add workflow hooks for classification, prompt build, model request, model response, normalization, fallback, and completion.
- [ ] Add low-friction DeepSeek telemetry hooks so raw structured response previews and HTTP status can be recorded.

### Task 5: Add Internal Read Endpoints

**Files:**
- Create: `apps/api/src/routes/internal/chat-traces.ts`
- Modify: `apps/api/src/app.ts`

- [ ] Add `GET /internal/debug/chat-traces/:turnTraceId`.
- [ ] Add `GET /internal/debug/chat-traces?chatId=...`.
- [ ] Gate the endpoints with simple config that stays open for local development and can be disabled in production.

### Task 6: Verify the MVP

**Files:**
- Modify as needed based on verification results

- [ ] Run the new chat trace tests and confirm they fail before implementation.
- [ ] Run the same tests after implementation and confirm they pass.
- [ ] Run `pnpm --filter @hall-of-fame/api typecheck`.
- [ ] Report residual gaps if artifact storage remains PostgreSQL-only in this MVP.
