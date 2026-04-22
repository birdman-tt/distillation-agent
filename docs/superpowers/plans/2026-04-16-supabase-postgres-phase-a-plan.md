# Supabase Postgres Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist dynamic persona, review, publish, share, chat, and feedback state in Supabase Postgres while preserving current route contracts and keeping auth/official seeds on their current track.

**Architecture:** Keep the current Fastify route surface and official-seed path intact, but replace dynamic in-memory state with a Postgres-backed repository layer. The existing store APIs remain the facade so routes and workflows change minimally while the implementation moves to database reads/writes plus explicit schema bootstrap on app startup.

**Tech Stack:** Fastify, TypeScript, Supabase Postgres (Session Pooler), `postgres` client, Node test runner, existing shared contracts/domain packages

---

## File Map

- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/config.ts`
  - Build `DATABASE_URL` from env, including Supabase session-pooler fallback using `POSTGRES_PASSWORD`.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/client.ts`
  - Own singleton postgres client + transaction helper.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/bootstrap.ts`
  - Ensure schema exists before API serves requests.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts`
  - Persist user-created personas, versions, sources, documents, spans, reviews, shares, feedback.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/chat-repository.ts`
  - Persist chats and messages.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/user-shadow-repository.ts`
  - Ensure `users` rows exist for in-memory actor IDs and reviewer/dev sessions.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/package.json`
  - Add `postgres` dependency.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/app.ts`
  - Bootstrap schema on app ready.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
  - Keep official-seed behavior; move dynamic path to async Postgres-backed operations.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/store/chat-store.ts`
  - Replace in-memory chat `Map` with DB-backed persistence.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts`
  - Await async store calls.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/persona-versions.ts`
  - Await async version/share calls.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/chats.ts`
  - Await DB-backed chat/persona lookups.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/reviews.ts`
  - Await DB-backed review flows.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/shares.ts`
  - Await DB-backed share landing.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/feedback.ts`
  - Await DB-backed feedback persistence.
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/app.test.ts`
  - Convert high-level flow test to run against Postgres-backed stores.
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/config.test.ts`
  - Verify env-derived DATABASE_URL logic.

### Task 1: Add DB Foundation

**Files:**
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/config.ts`
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/config.test.ts`
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/client.ts`
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/bootstrap.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/package.json`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/app.ts`

- [ ] **Step 1: Write failing config tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildDatabaseUrl } from "./config.js";

test("buildDatabaseUrl prefers explicit DATABASE_URL", () => {
  const url = buildDatabaseUrl({
    DATABASE_URL: "postgresql://explicit",
    POSTGRES_PASSWORD: "ignored",
  });

  assert.equal(url, "postgresql://explicit");
});

test("buildDatabaseUrl derives Supabase session pooler url from POSTGRES_PASSWORD", () => {
  const url = buildDatabaseUrl({
    DATABASE_URL: "postgresql://hof:hof@localhost:5432/hall_of_fame",
    POSTGRES_PASSWORD: "secret",
  });

  assert.match(url, /^postgresql:\/\/postgres\.dibwjojlwwgyxrocaysf:secret@aws-1-ap-southeast-1\.pooler\.supabase\.com:5432\/postgres$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test -- src/db/config.test.ts`
Expected: FAIL because `buildDatabaseUrl` does not exist.

- [ ] **Step 3: Write minimal DB foundation**

```ts
// config.ts
const LOCAL_PLACEHOLDER = "postgresql://hof:hof@localhost:5432/hall_of_fame";
const SUPABASE_SESSION_POOLER_HOST = "aws-1-ap-southeast-1.pooler.supabase.com";
const SUPABASE_SESSION_POOLER_USER = "postgres.dibwjojlwwgyxrocaysf";

export const buildDatabaseUrl = (env: NodeJS.ProcessEnv) => {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit && explicit !== LOCAL_PLACEHOLDER) {
    return explicit;
  }

  const password = env.POSTGRES_PASSWORD?.trim();
  if (!password) {
    return explicit ?? LOCAL_PLACEHOLDER;
  }

  return `postgresql://${SUPABASE_SESSION_POOLER_USER}:${encodeURIComponent(password)}@${SUPABASE_SESSION_POOLER_HOST}:5432/postgres`;
};
```

```ts
// client.ts
import postgres from "postgres";
import { buildDatabaseUrl } from "./config.js";

let sqlSingleton: postgres.Sql | null = null;

export const getSql = () => {
  if (!sqlSingleton) {
    sqlSingleton = postgres(buildDatabaseUrl(process.env), {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 20,
    });
  }
  return sqlSingleton;
};

export const withTransaction = <T>(run: (sql: postgres.TransactionSql) => Promise<T>) =>
  getSql().begin((sql) => run(sql));
```

```ts
// bootstrap.ts
import { readFile } from "node:fs/promises";

import { getSql } from "./client.js";

let bootstrapPromise: Promise<void> | null = null;

export const ensureDatabaseSchema = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const sql = getSql();
      const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
      await sql.unsafe(schema);
    })();
  }
  return bootstrapPromise;
};
```

- [ ] **Step 4: Make schema bootstrap idempotent and wire app startup**

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
    CREATE TYPE auth_provider AS ENUM ('ANONYMOUS', 'WEB_SMS', 'WECHAT_MINIAPP');
  END IF;
END $$;
```

```ts
// app.ts
import { ensureDatabaseSchema } from "./db/bootstrap.js";

app.addHook("onReady", async () => {
  await ensureDatabaseSchema();
});
```

- [ ] **Step 5: Run focused tests to verify DB foundation passes**

Run: `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test -- src/db/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap add apps/api/package.json apps/api/src/app.ts apps/api/src/db/config.ts apps/api/src/db/config.test.ts apps/api/src/db/client.ts apps/api/src/db/bootstrap.ts apps/api/src/db/schema.sql
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap commit -m "feat: add postgres foundation for api runtime"
```

### Task 2: Persist Dynamic Persona Lifecycle

**Files:**
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/user-shadow-repository.ts`
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/app.test.ts`

- [ ] **Step 1: Write failing API flow test for persisted persona/source/distill path**

```ts
test("persona flow persists through database-backed stores", async () => {
  const apiApp = buildApiApp();

  const anonymous = await apiApp.inject({ method: "POST", url: "/v1/auth/anonymous", payload: { deviceId: "browser-db" } });
  const anonymousBody = anonymous.json();

  const createdPersona = await apiApp.inject({
    method: "POST",
    url: "/v1/personae",
    headers: { authorization: `Bearer ${anonymousBody.accessToken}` },
    payload: {
      displayName: "数据库对象",
      personaType: "ORIGINAL_PERSONA",
      originType: "USER",
      distillFocus: ["表达", "判断"],
    },
  });

  const persona = createdPersona.json();

  const sourceResponse = await apiApp.inject({
    method: "POST",
    url: `/v1/personae/${persona.id}/sources/text`,
    headers: { authorization: `Bearer ${anonymousBody.accessToken}` },
    payload: {
      content: "这是一份可审核的文本资料。",
      sourceKind: "PRIMARY",
    },
  });

  assert.equal(sourceResponse.statusCode, 200);
  const listedSources = await apiApp.inject({
    method: "GET",
    url: `/v1/personae/${persona.id}/sources`,
    headers: { authorization: `Bearer ${anonymousBody.accessToken}` },
  });

  assert.equal(listedSources.statusCode, 200);
  assert.equal(listedSources.json().items.length, 1);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test -- src/app.test.ts`
Expected: FAIL because the store layer still depends on in-memory maps.

- [ ] **Step 3: Add user-shadow and dynamic persona repositories**

```ts
// user-shadow-repository.ts
export const ensureUserShadow = async (userId: string) => {
  const sql = getSql();
  const existing = await sql`select id from users where id = ${userId}::uuid`;
  if (existing.length > 0) return;

  await sql`
    insert into users (id, display_name)
    values (${userId}::uuid, null)
    on conflict (id) do nothing
  `;
};
```

```ts
// dynamic-persona-repository.ts
export const createDynamicPersona = async (input: {
  personaId: string;
  versionId: string;
  displayName: string;
  originType: "USER";
  personaType: "HISTORICAL_FIGURE" | "AUTHOR_OR_BLOGGER" | "ORIGINAL_PERSONA";
  distillFocus: string[];
  creatorUserId: string;
  createdAt: string;
}) => withTransaction(async (sql) => {
  await ensureUserShadow(input.creatorUserId);
  await sql`insert into personae (...) values (...)`;
  await sql`insert into persona_versions (...) values (...)`;
});
```

- [ ] **Step 4: Replace dynamic path in persona store with async repository calls**

```ts
export const createPersona = async (...) => {
  const createdAt = nowIso();
  const personaId = randomUUID();
  const versionId = randomUUID();

  await createDynamicPersonaRecord(...);
  return {
    persona: await getDynamicPersonaRecord(personaId),
    version: await getDynamicVersionRecord(versionId),
  };
};
```

```ts
export const createTextSource = async (...) => { ... };
export const createUrlSource = async (...) => { ... };
export const persistUrlSourceIngestResult = async (...) => { ... };
export const listPersonaSources = async (...) => { ... };
export const prepareDistillInput = async (...) => { ... };
export const persistDistilledVersion = async (...) => { ... };
```

- [ ] **Step 5: Update routes to await async store APIs**

Run the minimal route edits in:
- `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts`

Expected change pattern:

```ts
const { persona } = await createPersona({ ... });
const source = await createTextSource(...);
const prepared = await prepareDistillInput(request.params.personaId);
const result = await persistDistilledVersion(...);
```

- [ ] **Step 6: Run focused API test to verify it passes**

Run: `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test -- src/app.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap add apps/api/src/db/repositories/user-shadow-repository.ts apps/api/src/db/repositories/dynamic-persona-repository.ts apps/api/src/store/persona-store.ts apps/api/src/routes/personae/manage.ts apps/api/src/app.test.ts
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap commit -m "feat: persist dynamic persona lifecycle in postgres"
```

### Task 3: Persist Review, Publish, Share, and Chat State

**Files:**
- Create: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/db/repositories/chat-repository.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/store/chat-store.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/persona-versions.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/chats.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/reviews.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/shares.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/routes/feedback.ts`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/apps/api/src/app.test.ts`

- [ ] **Step 1: Extend the failing integration test to cover review/publish/share/chat**

```ts
const approved = await apiApp.inject({ ...approve source... });
assert.equal(approved.statusCode, 200);

const distilled = await apiApp.inject({ ...distill... });
assert.equal(distilled.statusCode, 200);

const submitPublish = await apiApp.inject({ ...submit publish review... });
assert.equal(submitPublish.statusCode, 200);

const publishApproved = await apiApp.inject({ ...approve publish... });
assert.equal(publishApproved.statusCode, 200);

const chat = await apiApp.inject({ method: "POST", url: "/v1/chats", payload: { targetType: "published_persona", personaId: persona.id } });
assert.equal(chat.statusCode, 200);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test -- src/app.test.ts`
Expected: FAIL because review/share/chat are still in-memory.

- [ ] **Step 3: Move review/share/version state into repository-backed store functions**

```ts
export const reviewSource = async (...) => { ...insert into source_reviews...update persona_sources... };
export const submitPublishReview = async (...) => { ...update persona_versions... };
export const reviewPublishRequest = async (...) => withTransaction(async (sql) => {
  // validate thresholds
  // update prior published version
  // update new published version + personae pointers
  // create primary share if needed
});
export const getShareLanding = async (...) => { ... };
```

- [ ] **Step 4: Replace chat-store with DB-backed persistence**

```ts
export const saveChatSession = async (session: ChatSession) => { ...upsert chats + chat_messages... };
export const getChatSession = async (chatId: string) => { ...select chats join chat_messages... };
```

```ts
export const createChatSession = async (...) => { ...insert into chats... };
export const appendChatMessages = async (...) => { ...insert into chat_messages... };
```

- [ ] **Step 5: Update routes to await async review/share/chat/feedback flows**

Expected change pattern:

```ts
const resolved = await resolveChatTarget(input);
const session = await getChatSession(request.params.chatId);
const landing = await getShareLanding(request.params.shareSlug);
const source = await reviewSource(...);
const result = await reviewPublishRequest(...);
return await addFeedback(...);
```

- [ ] **Step 6: Run the full API test and package verification**

Run:
- `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api test`
- `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap --filter @hall-of-fame/api typecheck`

Expected:
- test exit code `0`
- typecheck exit code `0`

- [ ] **Step 7: Commit**

```bash
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap add apps/api/src/db/repositories/chat-repository.ts apps/api/src/store/chat-store.ts apps/api/src/store/persona-store.ts apps/api/src/routes/persona-versions.ts apps/api/src/routes/chats.ts apps/api/src/routes/reviews.ts apps/api/src/routes/shares.ts apps/api/src/routes/feedback.ts apps/api/src/app.test.ts
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap commit -m "feat: persist review share and chat state in postgres"
```

### Task 4: Verify Workspace and Update Docs

**Files:**
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/.env.example.hall-of-fame`
- Modify: `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/README.md`

- [ ] **Step 1: Write failing expectation test or assertion for env docs**

Use a simple grep-based guard:

```bash
rg -n "aws-1-ap-southeast-1.pooler.supabase.com|POSTGRES_PASSWORD" /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/.env.example.hall-of-fame /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/README.md
```

Expected before edits: missing or incomplete documentation for Supabase Session Pooler fallback.

- [ ] **Step 2: Document runtime env expectations**

Add to `.env.example.hall-of-fame`:

```env
# Optional: leave DATABASE_URL unset and provide POSTGRES_PASSWORD to derive the Supabase Session Pooler URL.
DATABASE_URL=
POSTGRES_PASSWORD=replace-me
```

Add to `README.md`:

```md
For local and server runtime, the API derives `DATABASE_URL` from `POSTGRES_PASSWORD` if no non-placeholder `DATABASE_URL` is set. This is intended for the Supabase Session Pooler connection.
```

- [ ] **Step 3: Run final verification**

Run:
- `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap test`
- `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap typecheck`
- `pnpm --dir /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap build`

Expected:
- all commands exit `0`

- [ ] **Step 4: Commit**

```bash
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap add .env.example.hall-of-fame README.md
git -C /Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap commit -m "docs: document supabase postgres runtime configuration"
```
