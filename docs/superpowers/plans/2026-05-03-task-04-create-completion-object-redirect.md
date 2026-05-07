# Create Completion Object Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建蒸馏任务完成后，把用户带到自己的对象详情页，而不是继续进入 `/preview/:personaVersionId`。

**Architecture:** 后端 distill job response 增加稳定的用户对象入口 `objectId/objectHref`，由 `owned_persona_objects.source_distill_job_id` 反查。前端 create flow 只依赖 `objectHref` 做成功跳转，`/preview/:personaVersionId` 保留为旧链接兼容页，不再作为普通创建完成路径。

**Tech Stack:** TypeScript, Zod contracts, Fastify, PostgreSQL/Supabase, H5 client in `apps/client/src/h5-app.ts`, API repository in `apps/api/src/db/repositories/persona-distill-repository.ts`.

---

## 1. 业务边界

本任务只解决“创建完成后用户去哪里”的闭环，不重构蒸馏 worker。

必须满足：

- 创建成功后用户进入 `/profile/objects/:objectId`。
- 用户看到的是对象详情和可操作入口，不看到 preview 管理页。
- `mode=addSources` 从已完成 job 进入时，仍停留在资料补充界面，不能被成功跳转打断。
- `/preview/:personaVersionId` 保留，历史链接、旧分享或测试路径不能 404。
- 前端不得用 `personaVersionId` 自己拼对象管理页，必须以后端返回的 `objectHref` 为主。

不做：

- 不删除 `/preview/:personaVersionId`。
- 不改聊天消息生成逻辑。
- 不改 tool-calling 蒸馏 runtime。
- 不把 job 内部状态、质量分、模型 trace 展示给用户。

## 2. 文件范围

Modify:

- `packages/contracts/src/persona-distill.ts`
- `apps/api/src/db/repositories/persona-distill-repository.ts`
- `apps/api/src/persona-distill-v2.test.ts`
- `apps/client/src/h5-app.ts`
- `apps/client/src/chat-behavior.test.ts`

Review only unless test failure forces修改:

- `apps/api/src/routes/persona-distill.ts`

## 3. API Contract

`distillJobResponseSchema` 和 `createDistillJobResponseSchema` 增加：

```ts
objectId: z.string().uuid().nullable(),
objectHref: z.string().nullable(),
```

响应语义：

- 如果 job 已经有 owner object，返回 `objectId` 和 `/profile/objects/:objectId`。
- 如果历史 job 没有 owner object，返回 `null`，前端 fallback 到 `/profile/objects`，不 fallback 到 `/preview`。
- `objectHref` 是用户入口，不是内部 preview/version 入口。
- `resultVersionId` 保留兼容已有 worker 和旧接口调用。

## 4. 后端落地方案

### 4.1 Repository 查询 object

在 `apps/api/src/db/repositories/persona-distill-repository.ts` 增加内部 helper：

```ts
const loadOwnedObjectBySourceJobId = async (jobId: string, actorUserId: string) => {
  const rows = await getSql()<Array<{ id: string }>>`
    select id
      from owned_persona_objects
     where source_distill_job_id = ${jobId}::uuid
       and owner_user_id = ${actorUserId}::uuid
       and deleted_at is null
     limit 1
  `;
  return rows[0] ?? null;
};
```

如果当前 repository helper 需要在 transaction 内复用，则写成可接收 `sql` 的形式：

```ts
const loadOwnedObjectBySourceJobId = async (sql: any, actorUserId: string, jobId: string) => {
  const rows = await sql<Array<{ id: string }>>`
    select id
      from owned_persona_objects
     where source_distill_job_id = ${jobId}::uuid
       and owner_user_id = ${actorUserId}::uuid
       and deleted_at is null
     limit 1
  `;
  return rows[0] ?? null;
};
```

### 4.2 `getDistillJob`

`getDistillJob(jobId, actorUserId)` 返回对象入口：

```ts
const object = await loadOwnedObjectBySourceJobId(getSql(), actorUserId, job.id);

return {
  jobId: job.id,
  status: job.status,
  currentStep: job.currentStep,
  progress: job.progress,
  personaId: job.personaId,
  resultVersionId: job.resultVersionId,
  objectId: object?.id ?? null,
  objectHref: object ? `/profile/objects/${object.id}` : null,
  // existing fields...
};
```

`createDistillJob` 已经返回 `getDistillJob(jobId, actorUserId)`，因此 create response 会自然带上 `objectId/objectHref`。

### 4.3 Route

`apps/api/src/routes/persona-distill.ts` 原本已经用 contract parse response；contract 更新后 route 不需要额外拼字段。

如果 route parse 报错，只修 contract/repository，不在 route 层临时补字段。

## 5. 前端落地方案

在 `apps/client/src/h5-app.ts` create script 增加一个成功跳转 helper：

```ts
const getJobObjectHref = (job) =>
  typeof job?.objectHref === "string" && job.objectHref
    ? job.objectHref
    : job?.objectId
      ? "/profile/objects/" + encodeURIComponent(job.objectId)
      : "/profile/objects";
```

修改 `pollJob()`：

```ts
if (job.status === "SUCCEEDED") {
  stopPolling();
  window.location.href = getJobObjectHref(job);
  return;
}
```

修改 initial job load：

```ts
if (job?.status === "SUCCEEDED" && shouldAddSources) {
  // 保持现有补资料恢复逻辑
  showState("success");
  return;
}

if (job?.status === "SUCCEEDED") {
  window.location.href = getJobObjectHref(job);
  return;
}
```

必须删除 create flow 中这两处普通成功跳转：

```ts
window.location.href = "/preview/" + encodeURIComponent(job.resultVersionId);
```

但不能删除 preview page route 或其它旧链接兼容代码。

## 6. 测试计划

### 6.1 API focused tests

在 `apps/api/src/persona-distill-v2.test.ts` 增加或扩展测试：

```ts
assert.ok(job.json().objectId);
assert.equal(job.json().objectHref, `/profile/objects/${job.json().objectId}`);

const fetched = await apiApp.inject({
  method: "GET",
  url: `/v1/persona-distill-jobs/${job.json().jobId}`,
  headers: { authorization: `Bearer ${accessToken}` },
});

assert.equal(fetched.json().objectId, job.json().objectId);
assert.equal(fetched.json().objectHref, job.json().objectHref);
```

在 worker 成功后继续断言：

```ts
assert.equal(completed.json().objectId, job.json().objectId);
assert.equal(completed.json().objectHref, job.json().objectHref);
assert.ok(completed.json().resultVersionId);
```

如果已有 retry/refine 测试复用同一个 object，补充断言：

```ts
assert.equal(completedRetry.json().objectId, initialObjectId);
assert.equal(completedRetry.json().objectHref, `/profile/objects/${initialObjectId}`);
```

### 6.2 Client source tests

在 `apps/client/src/chat-behavior.test.ts` 增加断言：

```ts
assert.match(h5Source, /const getJobObjectHref = \(job\) =>/);
assert.match(h5Source, /window\.location\.href = getJobObjectHref\(job\)/);
assert.doesNotMatch(
  h5Source,
  /window\.location\.href = "\/preview\/" \+ encodeURIComponent\(job\.resultVersionId\)/,
);
assert.match(h5Source, /job\?\.status === "SUCCEEDED" && shouldAddSources/);
```

必须增加顺序断言，确保 `mode=addSources` 的已完成 job 会先进入补资料恢复逻辑，而不是先被普通成功跳转带走：

```ts
const initialJobLoadBlock = h5Source.match(
  /void HallOfFameClient\.ensureAnonymousSession\(\)\.then\(async \(\) => \{[\s\S]*?\n      \}\);\n    `/,
);
assert.ok(initialJobLoadBlock, "expected create initial job load block to exist");

const initialBlock = initialJobLoadBlock[0];
const addSourcesIndex = initialBlock.indexOf('job?.status === "SUCCEEDED" && shouldAddSources');
const successRedirectIndex = initialBlock.indexOf("window.location.href = getJobObjectHref(job)");

assert.ok(addSourcesIndex >= 0, "expected completed add-sources branch");
assert.ok(successRedirectIndex >= 0, "expected completed job object redirect branch");
assert.ok(addSourcesIndex < successRedirectIndex, "expected add-sources branch before success redirect");
```

注意：不能对整个 `h5Source` 使用 `doesNotMatch(/\/preview/)`，因为 preview 兼容路由仍应存在。

### 6.3 Verification commands

按顺序执行：

```bash
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/api typecheck
pnpm --filter @hall-of-fame/client typecheck
pnpm --filter @hall-of-fame/client test
cd apps/api && node --import tsx --test --test-name-pattern "distill job" src/persona-distill-v2.test.ts
```

如果 API focused pattern 覆盖不全，再执行：

```bash
cd apps/api && node --import tsx --test src/persona-distill-v2.test.ts
```

## 7. 验收标准

- `POST /v1/persona-distill-jobs` response 有 `objectId/objectHref`。
- `GET /v1/persona-distill-jobs/:jobId` response 有同一个 `objectId/objectHref`。
- job 成功后仍保持同一个对象入口。
- `/create` 普通成功路径跳 `/profile/objects/:objectId`。
- `/create?jobId=...&mode=addSources` 对已完成 job 仍展示补资料界面。
- `/preview/:personaVersionId` 仍可访问，不因本任务被删除。
- 用户侧不会看到 `resultVersionId`、质量分、tool trace 或 worker 细节。

## 8. 风险

- 风险：历史 job 没有关联 object。处理：响应 `objectId/objectHref = null`，前端 fallback 到 `/profile/objects`。
- 风险：`mode=addSources` 被成功跳转覆盖。处理：initial load 先判断 `shouldAddSources`，再做成功跳转。
- 风险：前端测试误删 preview 兼容。处理：只断言 create flow 不再拼 preview，不全局禁止 `/preview` 字符串。
- 风险：route 层和 repository 层重复拼对象入口。处理：对象入口只在 repository response 组装，route 只做 contract parse。
