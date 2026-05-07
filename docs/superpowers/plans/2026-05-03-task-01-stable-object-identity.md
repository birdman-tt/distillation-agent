# Task 1 Detailed Plan: Stable Object Identity, Contracts, And Migration Foundation

## Goal

建立稳定的 `owned_persona_objects` 身份层，让同一个用户对象在创建中、待确认、可聊天、已公开、删除前后都使用同一个 `objectId`。同时把普通用户 inventory contract 改成用户可理解的对象语义，不再要求质量分、coverage、style、publishGate reasons。

## Scope Adjustment

总计划的 Task 1 文件范围需要扩展。原因是稳定 `objectId` 不是单纯 schema/contract 变更，创建任务、worker 持久化候选、现有私用/公开保存路径都必须同步 object row，否则第一轮测试就会出现状态漂移。

本 task 允许修改：

- `packages/contracts/src/persona-inventory.ts`
- `packages/contracts/src/index.ts`
- `packages/api-client/src/personae.ts`
- `apps/api/src/db/schema.sql`
- `apps/api/src/db/bootstrap.ts`
- `apps/api/src/db/repositories/persona-distill-repository.ts`
- `apps/api/src/db/repositories/dynamic-persona-repository.ts`
- `apps/api/src/routes/me.ts`
- `apps/api/src/routes/persona-versions.ts`
- `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`
- `apps/client/src/h5-app.ts`
- `apps/client/src/dev-h5.test.ts`
- `apps/client/src/chat-behavior.test.ts`
- `apps/api/src/persona-distill-v2.test.ts`

## Single Source Of Truth

`owned_persona_objects` 是用户对象身份和用户可见状态的事实源。

`personae`、`persona_versions`、`persona_distill_jobs` 仍是业务执行表，但普通用户的“我的对象”列表和详情都以 `owned_persona_objects` 为入口。

状态同步规则：

- 创建 distill job 时，创建或复用 object row，并写 `status = CREATING` 或 `NEEDS_SOURCES`。
- worker 生成 candidate version 成功时，同一事务内写 `active_persona_version_id = versionId`，`status = PENDING_CONFIRM`。
- worker 判断资料不足时，写 `status = NEEDS_SOURCES`。
- worker 失败时，写 `status = FAILED`。
- 现有 private 保存路径执行后，写 `status = READY`。
- 现有 public 发布路径执行后，写 `status = PUBLIC`。
- 现有 candidate discard/reject 路径执行后，如果 object 没有可回退的 draft/public version，则写 `deleted_at` 并从 inventory 隐藏；如果有可回退版本，则回退到 `READY` 或 `PUBLIC`。
- 删除对象动作不是本 task 实现，但 schema 预留 `deleted_at`，后续 Task 3 使用。

读取时以 object row 为主，不把 job/version 内部状态直接暴露给前端。job/version 只用于补足 href、personaId、personaVersionId、sourceDistillJobId。

同一用户同一 `persona_id` 只能有一个 active object。这是对象生命周期 invariant。两个独立创建但同名的对象不会误合并，因为它们会有不同 `persona_id`；重试或补资料会复用同一个 `persona_id`，因此必须复用同一个 object。

## Database Design

新增表：

```sql
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
```

新增索引：

```sql
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
```

Bootstrap 必须幂等：

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，方便未来字段补充。
- `CREATE INDEX IF NOT EXISTS`
- backfill 使用 `insert ... on conflict do update` 或 `where not exists`，重复执行不产生重复 object。

Backfill 需要提取为可测试 helper，例如：

```ts
export const backfillOwnedPersonaObjects = async () => { ... };
```

`ensureDatabaseSchema` 调用该 helper；测试直接调用 helper 两次，不依赖 bootstrap promise 是否重跑。

Backfill 状态解析规则：

1. `deleted_at` 不参与 backfill。
2. 如果存在最新 candidate version，且它比当前 draft/public version 更新，则 object 状态为 `PENDING_CONFIRM`。
3. 如果存在最新 active/incomplete job，且它比当前 draft/public/candidate version 更新，则按 job 状态映射为 `CREATING | NEEDS_SOURCES | FAILED`。
4. 否则如果存在 current published version，则为 `PUBLIC`。
5. 否则如果存在 current draft version，则为 `READY`。
6. 否则如果存在 candidate version，则为 `PENDING_CONFIRM`。
7. 否则按最新 job 状态映射。

同一个 `owner_user_id + persona_id` 如果命中多条来源，只保留一个 object，并按上述状态解析规则更新。状态解析不能让旧失败 job 覆盖更新的 public/ready object。

## Contract Design

替换现有 inventory 普通用户 contract。

```ts
export const myObjectStatusSchema = z.enum([
  "CREATING",
  "NEEDS_SOURCES",
  "PENDING_CONFIRM",
  "READY",
  "PUBLIC",
  "FAILED",
  "DELETED",
]);

export const myObjectActionSchema = z.enum([
  "CHAT",
  "EDIT",
  "ADD_SOURCES",
  "DELETE",
  "CONFIRM",
  "PUBLISH",
  "SHARE",
  "RETRY",
]);

export const myObjectPrimaryActionSchema = z.enum([
  "VIEW_PROGRESS",
  "ADD_SOURCES",
  "OPEN_DETAIL",
  "CHAT",
  "RETRY",
]);

export const personaInventoryItemSchema = z.object({
  objectId: z.string().uuid(),
  personaId: z.string().uuid().nullable(),
  personaVersionId: z.string().uuid().nullable(),
  sourceDistillJobId: z.string().uuid().nullable(),
  displayName: z.string(),
  intro: z.string().nullable(),
  status: myObjectStatusSchema,
  updatedAt: z.string(),
  primaryAction: myObjectPrimaryActionSchema,
  primaryHref: z.string(),
  availableActions: z.array(myObjectActionSchema),
});
```

Inventory response：

```ts
export const personaInventoryResponseSchema = z.object({
  groups: z.object({
    creating: z.array(personaInventoryItemSchema),
    needsAttention: z.array(personaInventoryItemSchema),
    ready: z.array(personaInventoryItemSchema),
    public: z.array(personaInventoryItemSchema),
  }),
  items: z.array(personaInventoryItemSchema),
});
```

禁止字段：

- `qualitySummary`
- `coverageScore`
- `styleScore`
- `canPublishPublic`
- `canSavePrivate`
- `publishGate`
- `secondaryActions`
- `displayStatus`
- `itemType`

说明：

- `sourceDistillJobId` 和 `personaVersionId` 可以保留给前端生成 href，但 UI 不展示。
- `DELETED` 是内部动作和详情语义预留；`GET /v1/me/persona-inventory` 不返回 deleted object。
- Task 1 为了保持每步可运行，`primaryHref` 暂时可以指向当前已存在路由，例如 `/create?jobId=...`、`/preview/:versionId`、`/persona/:personaId`。Task 3/4 再切换为 `/profile/objects/:objectId` 和对象详情页。

## Backend Repository Plan

### createDistillJob

在 `createDistillJob` 事务内：

1. 继续创建或复用 `personae`。
2. 插入 `persona_distill_jobs`。
3. `insert into owned_persona_objects`，字段：
   - `owner_user_id = actorUserId`
   - `persona_id = personaId`
   - `source_distill_job_id = newJobId`
   - `display_name = intent.normalizedName`
   - `intro = null`
   - `status = CREATING` 或 `NEEDS_SOURCES`
4. 如果命中 `owner_user_id + persona_id` 唯一索引，则更新同一 object 的 `source_distill_job_id/status/updated_at`。

### getDistillJob

Task 1 不要求 response 暴露 `objectId`，这个放到 Task 6。这里只保证 object row 已经存在。

### worker persistCandidateVersion

在 `persistCandidateVersion` 同一事务内，在更新 `persona_distill_jobs` 为 `SUCCEEDED` 后同步：

```sql
UPDATE owned_persona_objects
   SET active_persona_version_id = versionId,
       intro = output.preview.previewIntro,
       status = 'PENDING_CONFIRM',
       updated_at = createdAt
 WHERE source_distill_job_id = job.id
    OR (owner_user_id = job.createdByUserId AND persona_id = job.personaId AND deleted_at IS NULL);
```

如果 object 缺失，插入一条 backfill object，保证旧 job 也能恢复。

### worker needs sources / failed

当 worker 写 `NEEDS_MORE_SOURCES`：

```sql
UPDATE owned_persona_objects
   SET status = 'NEEDS_SOURCES',
       updated_at = now()
 WHERE source_distill_job_id = job.id;
```

如果 update 行数为 0，必须 upsert fallback object：

```text
owner_user_id = job.createdByUserId
persona_id = job.personaId
source_distill_job_id = job.id
display_name = job.normalizedName
status = NEEDS_SOURCES
```

当 worker 写 `FAILED`：

```sql
UPDATE owned_persona_objects
   SET status = 'FAILED',
       updated_at = now()
 WHERE source_distill_job_id = job.id;
```

如果 update 行数为 0，必须 upsert fallback object，字段同上，`status = FAILED`。

### existing private/public publish

在现有 `publishPersonaVersion` 或等价 repository 中：

- `visibility = PRIVATE` 后，将 matching object 写为 `READY`。
- `visibility = PUBLIC` 后，将 matching object 写为 `PUBLIC`。
- matching 条件优先 `active_persona_version_id = versionId`，其次 `owner_user_id + persona_id`。

Task 3 会新增用户语言的 `/confirm` API；Task 1 只保证现有路径不会破坏 object 状态。

### existing discard/reject

在现有 `discardPersonaVersion` 或等价 repository 中：

- 如果 discarded version 是 object 的 `active_persona_version_id`，且 persona 没有 current draft/public version，则将 object 写 `status = DELETED`、`deleted_at = now()`，inventory 隐藏。
- 如果 persona 有 current public version，则将 object 回退为 `PUBLIC`，`active_persona_version_id = current_published_version_id`。
- 如果 persona 有 current draft version，则将 object 回退为 `READY`，`active_persona_version_id = current_draft_version_id`。
- 该逻辑必须 owner-only，不能影响内置对象或非 owner 对象。

### listPersonaInventory

Task 1 要让 `/v1/me/persona-inventory` 通过新 contract，避免前后端短暂不一致。

读取 `owned_persona_objects where owner_user_id = actorUserId and deleted_at is null`，映射：

```ts
CREATING -> primaryAction VIEW_PROGRESS, primaryHref /create?jobId=...
NEEDS_SOURCES -> primaryAction ADD_SOURCES, primaryHref /create?jobId=...&mode=addSources
FAILED -> primaryAction RETRY, primaryHref /create?jobId=...&mode=addSources
PENDING_CONFIRM -> primaryAction OPEN_DETAIL, primaryHref /preview/:versionId for Task 1, actions CONFIRM/ADD_SOURCES/DELETE
READY -> primaryAction CHAT, primaryHref /preview/:versionId for Task 1, actions CHAT/EDIT/ADD_SOURCES/DELETE/PUBLISH
PUBLIC -> primaryAction CHAT, primaryHref /persona/:personaId, actions CHAT/EDIT/ADD_SOURCES/DELETE/SHARE
```

Groups：

```ts
creating = status CREATING
needsAttention = NEEDS_SOURCES | FAILED | PENDING_CONFIRM
ready = READY
public = PUBLIC
```

### minimal H5 compatibility

Because this task changes the inventory response shape, Task 1 must include a minimal H5 profile adapter so `/profile` remains usable until Task 4 redesigns it.

Minimal UI adapter requirements:

- Read new groups: `creating`, `needsAttention`, `ready`, `public`.
- Read new item fields: `status`, `primaryAction`, `availableActions`, `intro`.
- Do not render `qualitySummary`, coverage/style, internal reasons, or old `displayStatus`.
- Keep current visual structure acceptable for now; Task 4 will redesign `/profile`, `/profile/objects`, and object detail.
- Do not add object detail routes in Task 1 unless needed for a compatibility redirect. If added, it must be minimal and not expose internal info.

## Test Plan

### Red Test 1: contract hides internal inventory fields

Modify `apps/api/src/persona-distill-v2.test.ts` or add a focused test in the same file:

```ts
test("persona inventory exposes user object semantics without internal quality fields", async () => {
  // create a candidate using createDistillCandidate
  // GET /v1/me/persona-inventory
  // assert first item has objectId/status/availableActions
  // assert item.status === "PENDING_CONFIRM"
  // Task 1 allows primaryHref to stay on an existing routable page, but objectId must exist.
  // assert !("qualitySummary" in item)
  // assert !("coverageScore" in item)
  // assert !("styleScore" in item)
  // assert !("publishGate" in item)
});
```

Expected before implementation: FAIL because current inventory returns `displayStatus`, `secondaryActions`, `qualitySummary`.

### Red Test 1b: profile page consumes new inventory shape without internal fields

Modify `apps/client/src/dev-h5.test.ts` or `apps/client/src/chat-behavior.test.ts`:

```ts
test("profile page consumes user object inventory groups without internal quality fields", () => {
  // assert h5 profile script references groups.creating, groups.needsAttention, groups.ready, groups.public
  // assert h5 profile script references item.status and item.availableActions
  // assert h5 profile script does not render item.qualitySummary
  // assert h5 profile script does not rely on item.displayStatus or item.secondaryActions
});
```

Expected before implementation: FAIL because current H5 profile uses old groups and old item fields.

### Red Test 2: object id is stable across candidate, private, public

```ts
test("owned object id remains stable across save private and publish public", async () => {
  // create candidate
  // inventory candidate item -> objectId
  // POST /v1/persona-versions/:versionId/publish { visibility: "PRIVATE" }
  // inventory ready item -> same objectId and status READY
  // POST /v1/persona-versions/:versionId/publish { visibility: "PUBLIC" }
  // inventory public item -> same objectId and status PUBLIC
});
```

Expected before implementation: FAIL because no `objectId` exists and old statuses are `CANDIDATE/PRIVATE/PUBLIC`.

### Red Test 3: job without enough sources creates recoverable object

```ts
test("distill job that needs sources creates a recoverable owned object", async () => {
  // create job with no usable selected sources or insufficient selected sources
  // GET inventory
  // assert item.status === "NEEDS_SOURCES"
  // assert item.primaryHref contains "/create?jobId="
  // assert item.availableActions includes "ADD_SOURCES"
  // assert no internal reasons are returned as qualitySummary
});
```

Expected before implementation: FAIL because current job item has no stable object and returns `qualitySummary.reasons`.

### Red Test 4: bootstrap/backfill is idempotent

Use direct SQL setup or existing helper-created data:

```ts
test("owned object backfill is idempotent for existing candidate and jobs", async () => {
  // create candidate through current flow
  // delete any owned_persona_objects rows if created by implementation setup, or insert old-shape data before ensure
  // call backfillOwnedPersonaObjects twice
  // assert count of active objects for persona is 1
  // assert object status maps to PENDING_CONFIRM or existing strongest state
});
```

Implementation must expose a focused `backfillOwnedPersonaObjects` helper so this test does not depend on `ensureDatabaseSchema` promise caching.

### Red Test 5: discarded candidate is hidden or reverted

```ts
test("discarding a candidate hides the owned object when there is no fallback version", async () => {
  // create candidate
  // capture objectId
  // POST /v1/persona-versions/:versionId/discard
  // GET inventory
  // assert objectId is not returned
});
```

If implementation later supports public/ready fallback in the same test file, add:

```ts
test("discarding a refinement candidate reverts owned object to the existing ready or public version", async () => {
  // save or publish an object
  // create a refinement candidate for the same persona/object
  // discard the candidate
  // assert inventory still includes the same objectId with status READY or PUBLIC
});
```

### Red Test 6: same name different persona does not merge objects

```ts
test("same owner can have two same-name objects when persona ids differ", async () => {
  // create or insert two user personae with the same display_name and different ids
  // backfill objects
  // assert inventory returns two distinct objectId values
});
```

## Commands

Run after red tests are written:

```bash
pnpm --filter @hall-of-fame/api test
```

Expected: targeted new tests fail for missing `objectId` / old inventory fields.

Run after implementation:

```bash
pnpm --filter @hall-of-fame/api test
pnpm --filter @hall-of-fame/api typecheck
pnpm --filter @hall-of-fame/client typecheck
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/client test
```

Expected: all pass.

## Risks

- `owned_persona_objects.status` can drift if future code updates job/version without object. Mitigation: this task updates all current transitions that create candidate, mark needs sources, mark failed, private save, public publish, and discard.
- Backfill can create duplicates. Mitigation: unique partial indexes and idempotent insert/update.
- Existing profile UI depends on old inventory fields. Mitigation: Task 1 includes minimal H5 compatibility changes and tests; Task 4 later redesigns the full experience.
- Existing `/preview` still leaks internal info after Task 1. This is accepted until Task 5/6, but Task 1 must not add new leakage.
- Publish route may still return internal gate fields. This is outside Task 1 unless inventory or profile exposes it; Task 3 must replace user-facing publish with object API that translates errors to user language.
- Deleted object detail behavior is outside Task 1; inventory must hide deleted objects, and Task 3 defines detail/delete semantics.

## Review Gate

Do not implement until subagent approves this Task 1 detailed plan.
