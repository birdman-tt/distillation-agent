# Task 2 Detailed Plan: Object Detail And Management APIs

## 目标

建立用户侧“我的对象”详情与管理 API，让前端后续可以从 `/profile/objects/:objectId` 进入统一对象详情，而不是继续直接依赖 `/preview/:personaVersionId`、`/publish`、`/discard` 这些版本语义接口。

本 task 只做后端与 contract，不做前端页面重构。前端会在下一 task 使用这些接口。

## 业务边界

用户看到的是“对象”，不是 `persona`、`version`、`job`。

用户侧动作语义：

- `确认使用`：把候选对象保存到我的对象，状态从 `PENDING_CONFIRM` 到 `READY`。
- `编辑`：只改用户对象展示信息，V1 限定为 `displayName`、`intro`。
- `删除`：隐藏我的对象，后续对象列表不再出现；历史聊天后续 task 再做只读处理。
- `公开分享`：把对象公开并返回分享入口；失败时只返回用户可理解文案。
- `补资料`：V1 不新建资料 API，返回可跳转到现有 create flow 的 `addSourcesHref`。

普通用户 API 不返回：

- quality score
- publishGate
- publishGate reasons
- model/tool trace
- raw source bucket
- internal job failure code

## API 范围

新增 contract 文件：

```text
packages/contracts/src/my-objects.ts
```

新增路由：

```http
GET /v1/me/objects/:objectId
PATCH /v1/me/objects/:objectId
DELETE /v1/me/objects/:objectId
POST /v1/me/objects/:objectId/confirm
POST /v1/me/objects/:objectId/publish
```

注册路由：

```text
apps/api/src/routes/my-objects.ts
apps/api/src/app.ts
```

## Contract 设计

复用 Task 1 的 `MyObjectStatus` 和 action enum。

详情响应：

```ts
type MyObjectDetail = {
  objectId: string;
  displayName: string;
  intro: string | null;
  status: MyObjectStatus;
  updatedAt: string;
  primaryAction: "VIEW_PROGRESS" | "ADD_SOURCES" | "OPEN_DETAIL" | "CHAT" | "RETRY";
  primaryHref: string;
  availableActions: Array<"CHAT" | "EDIT" | "ADD_SOURCES" | "DELETE" | "CONFIRM" | "PUBLISH" | "SHARE" | "RETRY">;
  chatHref: string | null;
  addSourcesHref: string | null;
  shareHref: string | null;
  editableFields: Array<"displayName" | "intro">;
  userMessage: string | null;
};
```

动作响应统一返回最新 detail，方便前端不做状态猜测：

```ts
type MyObjectShareSummary = {
  shareHref: string;
  canonicalUrl: string;
  miniappPath: string;
};

type MyObjectActionResponse = {
  object: MyObjectDetail;
  share: MyObjectShareSummary | null;
  message: string;
};
```

删除响应单独定义，不返回 detail，避免删除后 detail 语义和 404 规则冲突：

```ts
type DeleteMyObjectResponse = {
  objectId: string;
  deleted: true;
  message: string;
};
```

编辑输入：

```ts
type UpdateMyObjectInput = {
  displayName?: string;
  intro?: string | null;
};
```

字段限制：

- `displayName` trim 后 1-40 字。
- `intro` trim 后最多 120 字，可传 `null` 清空。
- 不允许编辑 profileJson、prompt、source、status。
- 详情 API 不返回 raw `personaId`、`personaVersionId`、`sourceDistillJobId`；前端只使用 href 和 action。
- 对象 action API 不复用 `ShareLinkResponse`，因为它包含 share id 和 raw `personaVersionId`；publish 只返回 `MyObjectShareSummary`。

## Repository 设计

在 `apps/api/src/db/repositories/persona-distill-repository.ts` 增加对象管理函数：

- `getOwnedPersonaObjectDetail(actorUserId, objectId)`
- `updateOwnedPersonaObject(actorUserId, objectId, input)`
- `confirmOwnedPersonaObject(actorUserId, objectId)`
- `publishOwnedPersonaObject(actorUserId, objectId)`
- `deleteOwnedPersonaObject(actorUserId, objectId)`

所有函数都必须以 `owned_persona_objects` 为入口，并带：

```sql
where id = $objectId
  and owner_user_id = $actorUserId
  and deleted_at is null
```

避免用户通过 versionId/personaId 越权操作别人的对象。

## 状态规则

`GET detail`：

- `CREATING`：返回 `userMessage = "正在生成"`，`chatHref = null`。
- `NEEDS_SOURCES`：返回 `addSourcesHref`，主操作为补资料。
- `FAILED`：返回 `addSourcesHref`，主操作为重试。
- `PENDING_CONFIRM`：返回 `CONFIRM`、`ADD_SOURCES`、`DELETE`，`chatHref` 可以指向后续 preview 兼容页。
- `READY`：返回 `CHAT`、`EDIT`、`ADD_SOURCES`、`PUBLISH`，不返回 `DELETE`，直到删除 API 在前端明确设计二次确认。
- `PUBLIC`：返回 `CHAT`、`EDIT`、`ADD_SOURCES`、`SHARE`，不返回 `DELETE`。

`confirm`：

- 只允许 `PENDING_CONFIRM` 且 `active_persona_version_id` 存在。
- 复用现有 private save 逻辑，但接口和返回文案不能出现 publish。
- 成功后 object 状态为 `READY`。
- 非 owner 返回 404，不泄露对象存在。

`publish`：

- 允许 `READY` 或 `PENDING_CONFIRM`，需要有 `active_persona_version_id`。
- 内部使用 publish gate，但失败只返回：
  - `message = "暂时不能公开，可以先自己使用或补充资料。"`
  - 最新 object detail
- 不返回 `publishGate` 或 reasons。

`delete`：

- V1 先做 soft delete：`deleted_at = now(), status = 'DELETED'`。
- 对 candidate version 可以继续调用现有 discard/reject 语义；对 READY/PUBLIC 不物理删除 persona/version/share。
- 删除接口返回 `{ objectId, deleted: true, message }`。
- 删除后 `GET detail` 返回 404，inventory 不返回该 object。
- 历史聊天的只读限制放到后续纯聊天 task。

`update`：

- 允许 `PENDING_CONFIRM | READY | PUBLIC | NEEDS_SOURCES | FAILED`。
- 更新 `owned_persona_objects.display_name`、`intro`。
- 如果存在 `persona_id`，同步 `personae.display_name`，保证聊天页对象名一致。
- 不改 `profile_json`，避免用户展示名编辑破坏蒸馏画像。

## 文件范围

- Create: `packages/contracts/src/my-objects.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/api-client/src/personae.ts`
- Modify: `apps/api/src/db/repositories/persona-distill-repository.ts`
- Create: `apps/api/src/routes/my-objects.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/persona-distill-v2.test.ts`

## 测试计划

新增/扩展 `apps/api/src/persona-distill-v2.test.ts`：

- owner 可以 `GET /v1/me/objects/:objectId`，非 owner 返回 404。
- detail 不包含 `qualitySummary`、`coverageScore`、`styleScore`、`publishGate`、`personaId`、`personaVersionId`、`sourceDistillJobId`。
- `confirm` 将 `PENDING_CONFIRM` 转为 `READY`，返回文案为用户语言。
- `confirm` 不接受非候选对象，返回 400 用户语言。
- `PATCH` 更新 `displayName/intro` 后，detail 和 inventory 保持一致。
- `DELETE` 返回 `{ deleted: true }`，之后 detail 404，inventory 不再出现该 object。
- `publish` 成功返回 share；失败返回用户语言，不返回 raw gate。
- `publish` 返回的 share 不包含 `id`、`personaVersionId`、`isPrimary`、`isActive`。
- 非 owner 对 detail/update/confirm/publish/delete 都返回 404。

验证命令：

```bash
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/api-client typecheck
pnpm --filter @hall-of-fame/api typecheck
node --import tsx --test --test-name-pattern "my object" src/persona-distill-v2.test.ts
```

如果修改影响现有 distill lifecycle，再跑完整：

```bash
node --import tsx --test src/persona-distill-v2.test.ts
```

## 风险与处理

- 风险：confirm/publish 直接复用 version API，会重新暴露 publish 语义。处理：路由层必须返回 object action response，不把 `publishPersonaVersionResponse` 直接透出。
- 风险：删除 READY/PUBLIC 破坏历史聊天。处理：本 task 只从我的对象隐藏，不物理删 version/persona；历史只读在后续聊天 task 做。
- 风险：编辑 displayName 与 profile/persona 名称不一致。处理：同步 `personae.display_name`，但不改 profileJson。
- 风险：sourceDistillJobId 是内部 id。处理：detail 不返回 raw `sourceDistillJobId`，只返回 `addSourcesHref`。
- 风险：公开 gate 仍需要内部判断。处理：repository 可读取 gate，但普通 response 只返回简短 message。

## 本 task 不做

- 不做 `/profile/objects` 前端页面。
- 不做自建对象纯聊天页。
- 不做 create success 跳转重构。
- 不做模型 tool runtime。
- 不做真实登录。
