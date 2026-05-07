# Task 03 Profile My Objects Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户侧“我的”改成简单入口，并新增“我的对象列表 / 对象详情 / 对象纯聊天”闭环，让蒸馏对象可以从详情页聊天、编辑、补资料、删除、公开或分享。

**Architecture:** H5 前端仍保持单文件渲染方式，不做大拆分。`/profile` 只展示入口；`/profile/objects` 拉取 `GET /v1/me/persona-inventory` 渲染对象列表；`/profile/objects/:objectId` 拉取 `GET /v1/me/objects/:objectId` 渲染管理详情，并调用 Task 2 已完成的对象管理 API。`/profile/objects/:objectId/chat` 是最小纯聊天入口，通过 objectId 创建聊天，不把用户带回 `/preview/:versionId`。为了符合“管理操作放详情页”，本任务只补一个后端契约小修正：对象详情的可删除状态返回 `DELETE`，但 inventory 列表仍不暴露删除入口。

**Tech Stack:** TypeScript, Fastify H5 server, inline browser JavaScript in `apps/client/src/h5-app.ts`, Node test runner, Fastify API, Zod contracts.

---

## 1. 业务边界

- `/profile` 不再直接展示对象列表、待处理数量、公开数量。
- `/profile` 只保留用户真正需要的入口：`我的对象`、`聊天列表`、`创建对象`。
- `/profile/objects` 是我的对象列表页，所有对象统一从这里进入详情。
- `/profile/objects/:objectId` 是管理页，可以编辑、聊天、补资料、删除、保存到我的、公开、查看分享。
- 本任务提前实现最小对象纯聊天入口 `/profile/objects/:objectId/chat`，避免详情页点击聊天回到 `/preview/:versionId`。
- 创建完成跳转不在本任务重做。后续 Task 4 再把创建完成从 `/preview/:versionId` 改成对象详情。
- 不展示内部信息：`personaId`、`personaVersionId`、`sourceDistillJobId`、quality 分数、publishGate、trace、tool call、审核原因。

## 2. 文件范围

### 修改

- `apps/client/src/h5-app.ts`
  - 新增 `buildMyObjectsPageBody()`
  - 新增 `renderMyObjectsPage()`
  - 新增 `buildMyObjectDetailPageBody()`
  - 新增 `renderMyObjectDetailPage(objectId: string)`
  - 新增 `renderMyObjectChatPage(objectId: string)`
  - 扩展 `renderChatScript()`，支持通过对象专用 endpoint 创建 chat，而不是只能内联 persona/version/share id
  - 简化 `buildProfilePageBody()`
  - 新增 `/profile/objects`、`/profile/objects/:objectId`、`/profile/objects/:objectId/chat` 路由
  - 删除 `/profile` 里直接 confirm/discard version 的旧前端逻辑
- `apps/client/src/dev-h5.test.ts`
  - 更新 profile 页面结构测试
  - 新增对象列表页结构测试
  - 新增对象详情页结构测试
- `apps/client/src/chat-behavior.test.ts`
  - 更新“profile inventory”源码断言为新对象页脚本
  - 增加对象详情调用对象管理 API 的源码断言
- `apps/api/src/db/repositories/persona-distill-repository.ts`
  - 只改 detail 的 `actionsByStatus`，让对象详情页可展示删除动作
  - 新增内部函数 `getOwnedPersonaObjectChatTarget(actorUserId, objectId)`，只给 API route 使用，不返回给普通对象详情接口
- `apps/api/src/routes/my-objects.ts`
  - 新增 `POST /v1/me/objects/:objectId/chats`
  - route 内部用 objectId 解析 active persona version 并创建 chat session，只返回 `{ chatId }`，不返回现有 `chatSessionSchema`
- `packages/contracts/src/my-objects.ts`
  - 新增 `myObjectChatResponseSchema = z.object({ chatId: z.string().uuid() })`
  - 该 schema 专用于对象聊天入口，避免复用会暴露 `targetPersonaVersionId` 的历史 chat session schema
- `packages/contracts/src/chats.ts`
  - `chatSessionSummarySchema` 增加 `ownedObjectId: string | null`
  - 该字段只用于聊天列表恢复用户自建对象的纯聊天页，不替代 chat session 的底层 target schema
- `apps/api/src/persona-distill-v2.test.ts`
  - 更新对象详情 API 测试，确认 READY/PUBLIC detail 可返回 `DELETE`，但 inventory 仍不把删除作为列表主动作
  - 新增对象 chat endpoint focused test
- `apps/api/src/db/repositories/chat-repository.ts`
  - 聊天列表 summary 通过 `created_by_user_id + persona_id` 映射当前用户的未删除 `owned_persona_objects.id`
- `apps/api/src/routes/chats.ts`
  - `/v1/chats` summary 返回 `ownedObjectId`，让 H5 历史列表能优先回到对象纯聊天页

### 不修改

- 不改数据库 schema。
- 不改 worker。
- 不改 distill tool runtime。
- 不改聊天消息发送协议。
- 不新增登录能力。

## 3. 后端契约小修正

当前 API 已允许删除非 `CREATING` 对象，但 detail 的 `availableActions` 没有给 READY/PUBLIC 返回 `DELETE`。这会导致详情页如果完全按 contract 渲染，就无法展示用户要求的删除动作。

实现规则：

- inventory 列表继续不在 READY/PUBLIC 暴露 `DELETE`，避免列表页误触。
- object detail 的 `availableActions` 对以下状态返回 `DELETE`：
  - `PENDING_CONFIRM`
  - `READY`
  - `PUBLIC`
  - `NEEDS_SOURCES`
  - `FAILED`
- `CREATING` 仍然不返回 `DELETE`，且 API 已拒绝直接 DELETE。
- detail 的 `chatHref` 对 READY/PUBLIC 必须返回 `/profile/objects/:objectId/chat`，不能返回 `/preview/:versionId`。

预期 detail action：

```ts
const detailActionsByStatus = {
  CREATING: [],
  NEEDS_SOURCES: ["ADD_SOURCES", "DELETE"],
  FAILED: ["RETRY", "ADD_SOURCES", "DELETE"],
  PENDING_CONFIRM: ["CONFIRM", "ADD_SOURCES", "DELETE"],
  READY: ["CHAT", "EDIT", "ADD_SOURCES", "PUBLISH", "DELETE"],
  PUBLIC: ["CHAT", "EDIT", "ADD_SOURCES", "SHARE", "DELETE"],
};
```

## 4. 最小对象纯聊天入口

### 4.1 为什么提前做

如果详情页的 `CHAT` 跳到 `/preview/:versionId`，用户会重新看到 preview 管理/试聊混合页，违背本轮产品收敛方向。因此 Task 3 必须提供最小纯聊天入口。

### 4.2 后端 endpoint

新增：

```http
POST /v1/me/objects/:objectId/chats
```

行为：

- 必须有 actor session。
- 只能访问自己的 object。
- object 必须是 `READY` 或 `PUBLIC`。
- object 必须有 `active_persona_version_id`。
- route 内部创建现有 chat session：
  - 底层 `targetType` 可以继续用 `draft_version_preview`，因为聊天工作流已经支持该 target。
  - 用户和 H5 页面只使用 objectId，不接触 personaVersionId。
- 返回最小响应：

```ts
type MyObjectChatResponse = {
  chatId: string;
};
```

原因：

- 现有 `chatSessionSchema` 含 `targetPersonaVersionId`，不能作为对象专用 API 的返回。
- H5 发消息只需要 `chatId`。
- 历史 `/v1/chats/:chatId` 仍可返回旧 schema，不在本任务改。

### 4.3 聊天列表恢复规则

对象聊天底层仍保存为 `draft_version_preview`，但聊天列表不能把它恢复到 `/preview/:versionId`。

因此 `/v1/chats` summary 增加：

```ts
type ChatSessionSummary = {
  ownedObjectId: string | null;
};
```

后端映射规则：

- `ownedObjectId` 只在当前 actor 拥有同一 `persona_id` 的未删除对象时返回。
- 映射使用 `chats.created_by_user_id`、`persona_versions.persona_id`、`owned_persona_objects.owner_user_id`。
- 不改变 chat session 表结构，不新增 `owned_object` target type。

H5 历史列表规则：

- 如果 `item.ownedObjectId` 存在，优先跳转：
  - `/profile/objects/:ownedObjectId/chat?chatId=:chatId&from=history`
- 只有没有 `ownedObjectId` 时，`draft_version_preview` 才回落到 `/preview/:versionId`。
- `/profile/objects/:objectId/chat` 必须读取 query `chatId`，并把它传给 `renderChatScript({ initialChatId })` 恢复旧消息。

失败文案：

```text
对象还不能聊天。
对象不存在或已删除。
```

禁止：

- 不新增 `owned_object` 到 DB enum，避免为一个前端入口做 schema 级迁移。
- 不在 `GET /v1/me/objects/:objectId` 返回 raw `personaVersionId`。
- 不把 `/preview/:versionId` 作为聊天入口。
- 不从对象 chat endpoint 返回 `targetPersonaVersionId`。

## 5. 前端页面方案

### 5.1 `/profile`

页面只显示：

- 顶部：`我的`
- 一句说明：`对象、聊天和创建入口。`
- 入口卡片：
  - `我的对象` -> `/profile/objects`
  - `聊天列表` -> `/history`
  - `创建对象` -> `/create`

禁止出现：

- 待处理数量
- 已公开数量
- 对象列表
- `data-profile-persona-list`
- 旧的 `data-confirm-version`
- 旧的 `data-discard-version`
- 审核入口

### 5.2 `/profile/objects`

列表页职责：

- 调用 `GET /v1/me/persona-inventory`。
- 空状态：`还没有对象，先创建一个。`
- 每个对象只展示：
  - 名称
  - 简介，没有简介时展示 `还没有简介。`
  - 用户状态文案
  - 更新时间可选，如果已有 `updatedAt`，只展示简短日期或 `刚刚`
- 每个对象点击进入 `/profile/objects/:objectId`。
- 列表页不展示删除、公开、质量、内部 ID。

状态文案：

```js
const myObjectStatusCopy = {
  CREATING: "创建中",
  NEEDS_SOURCES: "需要补资料",
  FAILED: "生成失败",
  PENDING_CONFIRM: "待确认",
  READY: "可聊天",
  PUBLIC: "已公开",
};
```

分组顺序：

```js
[
  ["needsAttention", "需要处理"],
  ["creating", "创建中"],
  ["ready", "可聊天"],
  ["public", "已公开"],
]
```

### 5.3 `/profile/objects/:objectId`

详情页职责：

- 调用 `GET /v1/me/objects/:objectId`。
- 404 或无权限：展示 `对象不存在或已删除。`，提供 `返回我的对象`。
- 展示：
  - 名称
  - 简介
  - `userMessage` 或状态文案
- 动作区按 `availableActions` 渲染。

动作映射：

```js
const myObjectActionCopy = {
  CHAT: "聊天",
  EDIT: "编辑",
  ADD_SOURCES: "补资料",
  DELETE: "删除",
  CONFIRM: "保存到我的",
  PUBLISH: "公开分享",
  SHARE: "查看分享",
  RETRY: "重新生成",
};
```

动作行为：

- `CHAT`：跳转 `object.chatHref`；`object.chatHref` 必须是 `/profile/objects/:objectId/chat`，如果没有，显示 `现在还不能聊天。`
- `EDIT`：展开表单，只允许编辑 `displayName` 和 `intro`。
- `ADD_SOURCES`：跳转 `object.addSourcesHref`，没有则 `/create`。
- `RETRY`：同 `ADD_SOURCES`。
- `CONFIRM`：调用 `POST /v1/me/objects/:objectId/confirm`，成功后重新加载 detail。
- `PUBLISH`：调用 `POST /v1/me/objects/:objectId/publish`，成功后重新加载 detail；如返回 `share.shareHref`，显示一个 `查看分享` 链接。
- `SHARE`：跳转 `object.shareHref`；如果没有，显示 `暂时没有分享链接。`
- `DELETE`：二次确认文案 `删除后会从我的对象移除。`；确认后调用 `DELETE /v1/me/objects/:objectId`，成功跳转 `/profile/objects`。

编辑表单规则：

- 默认隐藏，点击 `编辑` 后展示。
- `displayName` 必填，1-40 字。
- `intro` 可为空，最多 120 字。
- 保存调用 `PATCH /v1/me/objects/:objectId`。
- 成功后收起表单并重新加载 detail。

### 5.4 `/profile/objects/:objectId/chat`

页面职责：

- 纯聊天页，不展示对象状态、编辑、补资料、公开、删除。
- 页面标题来自对象详情的 `displayName`。
- 只展示返回详情、消息列表、输入框、正在输入动效。
- 进入页面后调用 `GET /v1/me/objects/:objectId` 获取对象名；如果对象不能聊天，显示 `现在还不能聊天。` 和 `返回对象详情`。
- 发送第一条消息前调用 `POST /v1/me/objects/:objectId/chats` 创建 chat session。
- 后续消息仍使用现有 `/v1/chats/:chatId/messages`。

`renderChatScript()` 修改方式：

```ts
const renderChatScript = (input: {
  targetType: "published_persona" | "draft_version_preview" | "share_link";
  targetValue: string;
  assistantName?: string;
  initialChatId?: string | null;
} | {
  targetType: "owned_object";
  objectId: string;
  assistantName?: string;
  initialChatId?: string | null;
}) => string;
```

`owned_object` 分支只生成：

```js
chatCreation = HallOfFameClient.requestJson(
  "/v1/me/objects/" + encodeURIComponent(objectId) + "/chats",
  { method: "POST" }
).then((created) => created.chatId)
```

## 6. 测试计划

### 6.1 H5 静态结构测试

修改 `apps/client/src/dev-h5.test.ts`：

- `supporting pages inherit the same dark-chat shell`
  - `profilePage` 应包含 `/profile/objects`、`/history`、`/create`。
  - `profilePage` 不应包含 `data-profile-persona-list`、`data-profile-draft-count`、`data-profile-published-count`。
- 新增 `my objects page renders as object list entry`
  - `buildMyObjectsPageBody()` 包含 `data-my-objects-list`。
  - 包含 `我的对象`。
  - 包含 bottom shuttle active profile。
- 新增 `my object detail page renders management surface`
  - `buildMyObjectDetailPageBody("demo")` 包含 `data-my-object-detail`。
  - 包含 `data-my-object-actions`。
  - 包含 `data-my-object-edit-form`。
  - 不包含 `quality`、`coverage`、`publishGate`。
- 新增 `my object chat page is pure chat`
  - `renderMyObjectChatPage("demo")` 包含 `data-chat-form`。
  - 包含返回对象详情链接 `/profile/objects/demo`。
  - 不包含 `data-my-object-actions`、`data-my-object-edit-form`、`补资料`、`公开分享`、`删除`。
- 新增 `my object chat page inline script is syntactically valid`
  - 使用 `renderMyObjectChatPage("demo", { chatId })` 生成完整 HTML。
  - 抽取最后一个 inline script。
  - 用 `new Function(script)` 校验没有同作用域 `const` 重复声明导致的语法错误。
  - 断言 `initialChatId` 被写入脚本。

### 6.2 H5 源码行为测试

修改 `apps/client/src/chat-behavior.test.ts`：

- profile 不再直接操作 `/v1/persona-versions/:id/publish` 和 `/discard`。
- 源码包含：
  - `"/v1/me/persona-inventory"`
  - `"/v1/me/objects/" + encodeURIComponent(objectId)`
  - `"/confirm"`
  - `"/publish"`
  - `method: "DELETE"`
  - `method: "PATCH"`
  - `targetType: "owned_object"`
  - `"/v1/me/objects/" + encodeURIComponent(objectId) + "/chats"`
  - `item.ownedObjectId` 在 `draft_version_preview` 分支前优先处理。
  - 历史列表对象聊天链接为 `/profile/objects/:ownedObjectId/chat?chatId=...&from=history`。
- 源码不包含：
  - `item.sourceDistillJobId` 用于 profile 列表操作
  - `item.personaVersionId` 用于 profile confirm/discard
  - `object.chatHref` 指向 `/preview/`
  - `version.coverageScore`
  - `version.styleScore`
  - `version.publishGate`

### 6.3 API 回归测试

修改 `apps/api/src/persona-distill-v2.test.ts`：

- 在 `my object detail management api keeps object semantics without internal ids` 中增加断言：
  - confirm 后 READY 的 detail `availableActions` 包含 `DELETE`。
  - publish 后 PUBLIC 的 detail `availableActions` 包含 `DELETE`。
  - inventory 中 READY/PUBLIC 的 `availableActions` 明确不包含 `DELETE`。
  - READY/PUBLIC detail 的 `chatHref` 是 `/profile/objects/:objectId/chat`。
- 新增或扩展对象 chat endpoint 测试：
  - `POST /v1/me/objects/:objectId/chats` 对非 owner 返回 404。
  - `CREATING` object 返回 400 `对象还不能聊天。`。
  - READY object 返回 200 `{ chatId }`。
  - response 不包含 `targetType`、`targetPersonaId`、`targetPersonaVersionId`、`personaVersionId`。
  - 给该 `chatId` 写入一条消息后，`GET /v1/chats` 返回的对应 item 包含 `ownedObjectId`。
  - 历史 `/v1/chats/:chatId` schema 不在本任务改。
- `apps/api/src/app.test.ts` 中已有聊天列表回归用例需要继续通过，确认官方 persona 的历史列表仍正常。

### 6.4 命令

实施完成后运行：

```bash
pnpm --filter @hall-of-fame/client test
pnpm --filter @hall-of-fame/contracts typecheck
pnpm --filter @hall-of-fame/api typecheck
node --import tsx --test --test-name-pattern "my object detail management api" src/persona-distill-v2.test.ts
node --import tsx --test --test-name-pattern "my object chat endpoint" src/persona-distill-v2.test.ts
```

如果改动影响 contracts 或 API client，再补跑：

```bash
pnpm --filter @hall-of-fame/api-client typecheck
```

## 7. 风险与约束

- `h5-app.ts` 已经很大，本任务不做结构拆分，避免把页面重构和产品闭环混在一起。
- `/profile/objects/:objectId/chat` 只做最小纯聊天，不做聊天体验重设计。
- 详情页删除 PUBLIC 对象只从“我的对象”移除，不撤销已有公开分享；如果后续要下架分享，需要单独设计。
- `/preview/:versionId` 仍作为旧链接兼容存在，但 Task 3 后不能作为“我的对象详情”的聊天入口。
- 所有新 UI 文案都要遵守 `AGENTS.md`：少展示、只展示对用户下一步有帮助的信息。

## 8. 执行顺序

- [ ] Step 1: 先改 API detail action contract、chatHref、`myObjectChatResponseSchema` 和对象 chat endpoint 测试。
- [ ] Step 2: 实现 API 最小对象 chat endpoint，并跑 API focused test。
- [ ] Step 3: 改 `/profile` 页面结构，删除旧 profile inline inventory 脚本。
- [ ] Step 4: 新增 `/profile/objects` 页面 body、script 和 route。
- [ ] Step 5: 新增 `/profile/objects/:objectId` 页面 body、script 和 route。
- [ ] Step 6: 新增 `/profile/objects/:objectId/chat` 页面和 `renderChatScript()` owned object 分支。
- [ ] Step 7: 更新 client 静态测试和源码行为测试。
- [ ] Step 8: 跑 client test、contracts typecheck、API typecheck、API focused test。
- [ ] Step 9: 交给 Kant 做实现验收。

## 9. 自检

- 覆盖“我的 -> 我的对象 -> 对象列表 -> 对象详情 -> 操作 / 纯聊天”的产品路径。
- 不在聊天页增加管理信息。
- 不暴露内部 ID、评分、gate、trace。
- 对象专用 chat endpoint 只返回 `chatId`。
- 删除动作只在详情页出现，不在列表页误触。
- `CREATING` 仍不能编辑或删除。
- `CHAT` 不会从对象详情跳到 `/preview/:versionId`。
- 没有数据库和 worker 改动。
