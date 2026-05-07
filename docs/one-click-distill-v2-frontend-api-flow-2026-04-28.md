# 一键蒸馏 V2 前端功能与接口对接方案

- 日期：2026-04-28
- 状态：前端流程草稿，等待产品文档 review 后联动修正
- 关联产品交互：`docs/one-click-distill-v2-product-interaction-2026-04-28.md`
- 关联后端计划：`docs/superpowers/plans/2026-04-27-nuwa-inspired-one-click-distill-v2.md`
- 范围：定义 H5 前端功能、页面状态、接口对接和旧流程迁移，不实现代码

## 1. 当前前端问题

当前 `/create` 是手动 workbench：

```text
填写名称 / 简介 / 风格
  -> POST /v1/personae
  -> 添加 text/url source
  -> POST /v1/personae/:personaId/distill
  -> 跳转 /preview/:versionId
```

这和一键蒸馏目标不一致：

- 用户要先理解“创建对象表单”，而不是直接输入想蒸馏谁。
- 资料发现依赖用户手动添加，没有自动 source discovery。
- 蒸馏是同步按钮等待，不适合多阶段后台任务。
- 没有 job progress 和恢复机制。
- 没有将资料不足、风险阻断、publish gate 分开表达。
- 没有 owner inventory，蒸馏成功但未保存的 candidate version 可能离开后找不到。

V2 前端目标：

```text
/create
  -> subject entry
  -> intent check
  -> source discovery
  -> source confirmation
  -> distill job progress
  -> /preview/:versionId
```

## 2. 页面路由调整

### `/create`

默认创建入口，承载一键蒸馏流程。

职责：

- 管理 subject 输入。
- 管理 intent/discovery/job 的本地状态。
- 展示 source candidates。
- 接收用户补充 URL/text。
- 创建 distill job。
- 轮询 job 状态。
- 成功后跳转 preview。

### `/create?personaId=...`

保留为高级编辑入口。

职责：

- 进入旧 workbench。
- 不作为默认创建入口。
- 仅当 version 没有 `sourceDistillJobId` 时，preview 的 `补充资料再蒸馏` 才回退到这里。

### `/create?jobId=...`

用于恢复蒸馏进度。

职责：

- 页面加载后直接调用 `GET /v1/persona-distill-jobs/:jobId`。
- 根据 job 状态恢复到 progress、needs-more-sources、failed 或跳转 preview。

### `/preview/:personaVersionId`

预览聊天页。

职责：

- 加载 candidate/private version。
- 启动 draft preview chat。
- 展示弱信息卡。
- 提供私用保存、公开分享、补资料再蒸馏。
- 对 `CANDIDATE` 展示“待确认”语义。
- 对 `PRIVATE` 展示 owner-only “私用对象”语义，不能继续叫“预览中”。

### `/profile`

我的页面。

职责：

- 作为 owner inventory，展示用户自己的对象和蒸馏任务。
- 展示进行中、资料不足、失败、待确认、已保存、已公开。
- 支持回到进行中的 job、继续补资料、打开待确认 preview、打开私用对象、打开公开对象或分享页。

### `/history`

聊天会话列表，是次级入口，不进入底部一级导航。

职责：

- 展示已经产生过消息的 chat sessions。
- 点击后恢复原 chat session。
- 不展示未聊天的蒸馏对象。
- 不承担对象库职责。

## 3. `/create` 前端状态机

```ts
type CreateStage =
  | "subject_entry"
  | "intent_checking"
  | "intent_blocked"
  | "intent_needs_review"
  | "discovering_sources"
  | "source_confirmation"
  | "extra_source_checking"
  | "creating_job"
  | "distill_progress"
  | "needs_more_sources"
  | "distill_failed";
```

本地状态：

```ts
type CreateDistillState = {
  stage: CreateStage;
  query: string;
  usageIntent: "chat_companion" | "decision_lens" | "learning" | "roleplay";
  focus: string[];
  intent: DistillIntentResponse | null;
  discovery: DistillSourceDiscoveryOutput | null;
  selectedSourceCandidateIds: string[];
  selectedExtraSourceIds: string[];
  pendingExtraSources: DistillExtraSourceCandidate[];
  job: DistillJobResponse | null;
  errorMessage: string | null;
};
```

`DistillExtraSourceCandidate` 应与 source candidate 使用同一套前端展示字段，并额外包含校验状态：

```ts
type DistillExtraSourceCandidate = DistillSourceCandidate & {
  extraSourceId: string;
  status: "PENDING" | "USABLE" | "REJECTED";
  rejectionReason: string | null;
};
```

状态流转：

```text
subject_entry
  -> intent_checking
  -> intent_blocked
  -> intent_needs_review
  -> discovering_sources
  -> source_confirmation
  -> extra_source_checking
  -> creating_job
  -> distill_progress
  -> needs_more_sources
  -> distill_failed
  -> /preview/:versionId
```

规则：

- `intent_blocked` 不能继续到 discovery。
- `intent_needs_review` 在 V1 用户端按“暂不支持普通创建”处理，不能进入普通 job。
- `source_confirmation` 必须满足最低资料门槛，才能进入 `creating_job`。
- `distill_progress` 只能由 job polling 驱动。
- `NEEDS_MORE_SOURCES` 回到 `source_confirmation`，保留用户已选来源和补充资料。
- `FAILED` 允许重试当前 job 创建，或返回 `source_confirmation`。

## 4. 前端接口清单

### 创建 intent

```http
POST /v1/persona-distill-intents
```

触发时机：

- 用户点击 `查找资料`。

请求：

```json
{
  "query": "雷军",
  "usageIntent": "chat_companion",
  "focus": ["说话方式", "思考方式"]
}
```

成功处理：

- `riskDecision=ALLOW`：进入 `discovering_sources`。
- `riskDecision=NEED_REVIEW`：进入 `intent_needs_review`，展示“暂不支持普通创建”；不进入 discovery，不创建 job。
- `riskDecision=BLOCK`：进入 `intent_blocked`。

### 资料发现

```http
POST /v1/persona-distill-source-discovery
```

触发时机：

- intent 允许继续后自动调用。

请求：

```json
{
  "intentId": "uuid",
  "preferredLanguage": "zh-CN",
  "maxSourcesPerBucket": 4
}
```

成功处理：

- 保存 `discovery`。
- 默认选中 `recommended=true` 且 `riskFlags=[]` 的 candidates。
- 进入 `source_confirmation`。

失败处理：

- 网络或服务失败：允许重试 discovery。
- `riskDecision=BLOCK`：进入 `intent_blocked`。
- `riskDecision=NEED_REVIEW`：进入 `intent_needs_review`，不创建 job。
- candidates 为空：进入 `source_confirmation`，提示用户手动添加资料。

### 添加并校验用户补充资料

```http
POST /v1/persona-distill-discoveries/:discoveryId/extra-sources
```

触发时机：

- 用户在来源确认页添加 URL 或粘贴文本。

请求：

```json
{
  "extraTextSources": [
    {
      "title": "访谈摘录",
      "content": "...",
      "sourceKind": "PRIMARY"
    }
  ],
  "extraUrlSources": [
    {
      "url": "https://example.com/article",
      "title": "可选标题",
      "sourceKind": "SECONDARY"
    }
  ]
}
```

成功处理：

- 后端返回校验后的 `pendingExtraSources` 或合并后的 `sourceCandidates`。
- 前端刷新来源列表。
- 校验通过的 pending extra source 可被用户勾选。
- 校验失败的 pending extra source 展示失败原因，但不能勾选。

注意：

- 用户补充资料不能只保存在前端 state。
- pending extra source 必须绑定 `discoveryId`，否则刷新、返回和 job 重试无法恢复。

### 创建 distill job

```http
POST /v1/persona-distill-jobs
```

触发时机：

- 用户在来源确认页点击 `开始蒸馏`。

请求：

```json
{
  "intentId": "uuid",
  "discoveryId": "uuid",
  "selectedSourceCandidateIds": ["uuid"],
  "selectedExtraSourceIds": ["uuid"]
}
```

成功处理：

- 保存 `jobId`。
- `history.replaceState` 到 `/create?jobId=...`。
- 进入 `distill_progress`。
- 开始轮询。

### 轮询 distill job

```http
GET /v1/persona-distill-jobs/:jobId
```

轮询策略：

- 默认每 2 秒一次。
- 页面隐藏时降到每 8 秒一次。
- `SUCCEEDED / FAILED / BLOCKED / NEEDS_MORE_SOURCES` 停止轮询。

成功状态处理：

| 状态 | 前端处理 |
| --- | --- |
| `QUEUED` | 展示排队中 |
| `CLAIMED` | 展示开始处理 |
| `INGESTING` | 展示整理资料 |
| `EXTRACTING` | 展示抽取表达和判断方式 |
| `SYNTHESIZING` | 展示合成人格画像 |
| `VALIDATING` | 展示检查质量 |
| `PERSISTING` | 展示准备预览 |
| `SUCCEEDED` | owner inventory 可查询后跳转 `/preview/:resultVersionId` |
| `NEEDS_MORE_SOURCES` | 进入 `needs_more_sources`，允许补资料 |
| `BLOCKED` | 进入 `intent_blocked` |
| `FAILED` | 进入 `distill_failed` |

job response 必须支持恢复：

```ts
type DistillJobResponse = {
  jobId: string;
  status: DistillJobStatus;
  currentStep: string;
  progress: number;
  personaId: string | null;
  resultVersionId: string | null;
  intent: DistillIntentResponse;
  discovery: DistillSourceDiscoveryOutput;
  selectedSourceCandidateIds: string[];
  selectedExtraSourceIds: string[];
  pendingExtraSources: DistillExtraSourceCandidate[];
  missingRequirements: string[];
  qualityScores: DistillQualityScores | null;
  error: { code: string; message: string } | null;
};
```

`/create?jobId=...` 恢复规则：

- `QUEUED/CLAIMED/INGESTING/EXTRACTING/SYNTHESIZING/VALIDATING/PERSISTING`：恢复到 `distill_progress`。
- `NEEDS_MORE_SOURCES`：恢复到 `source_confirmation`，保留已选来源和 pending extra sources。
- `FAILED`：恢复到 `distill_failed`，保留错误原因。
- `BLOCKED`：恢复到 `intent_blocked` 或 `intent_needs_review`。
- `SUCCEEDED`：跳转 `/preview/:resultVersionId`。
- `SUCCEEDED` 时，后端必须已经让 `resultVersionId` 可通过 owner inventory 查询；前端跳转 preview 只是即时引导，不是唯一找回路径。

## 5. Source Confirmation UI 数据规则

来源列表分组：

- 默认按 `bucket` 分组。
- 每组内推荐来源在前。
- `trustLevel=LOW` 默认不选中。
- `riskFlags.length > 0` 默认不选中。

继续按钮启用逻辑：

```ts
const canStartDistill = (state: CreateDistillState) => {
  const selected = state.discovery.sourceCandidates.filter((item) =>
    state.selectedSourceCandidateIds.includes(item.sourceCandidateId),
  );
  const usableExtraSources = state.pendingExtraSources.filter(
    (item) => item.status === "USABLE" && state.selectedExtraSourceIds.includes(item.extraSourceId),
  );
  const extraCount = usableExtraSources.length;
  const usableCount = selected.length + extraCount;
  const buckets = new Set([...selected.map((item) => item.bucket), ...usableExtraSources.map((item) => item.bucket)]);

  if (state.intent?.entityType === "FICTIONAL_CHARACTER") {
    const hasCanon = [...selected, ...usableExtraSources].some((item) =>
      ["canon", "official_primary", "official_secondary"].includes(item.sourceCategory),
    );
    return usableCount >= 2 && buckets.size >= 2 && hasCanon;
  }

  const hasPrimaryOrSecondary = [...selected, ...usableExtraSources].some(
    (item) => item.sourceKind === "PRIMARY" || item.sourceKind === "SECONDARY",
  );
  return usableCount >= 3 && buckets.size >= 2 && hasPrimaryOrSecondary;
};
```

注意：

- 前端启用逻辑只是用户体验校验。
- 后端必须重新校验，不能信任前端。
- 用户补充资料必须先持久化并通过 pending extra source 校验，不能只在前端临时计数。
- 前端启用按钮时只能统计 `status=USABLE` 的 pending extra sources。

## 6. Preview 页面改造

当前 `/preview/:personaVersionId` 已有聊天能力，需要调整信息组织。

保留：

- draft preview chat。
- 私用保存。
- 公开分享。

新增：

- 弱信息卡：
  - 资料覆盖度
  - 风格相似度
  - 可问方向
  - 缺失资料提示
- `补充资料再蒸馏` 入口。
- publish gate 不通过时的私用可保存状态。
- candidate/private/public 三种 owner 语义。

信息卡字段来源：

- `coverageScore`、`groundingScore`、`styleScore`、`riskScore`：来自 `GET /v1/persona-versions/:id`。
- `bucketCoverage`、`weakBuckets`：来自 `version.profileJson.sourceSummary`。
- `topicStrengths`：来自 `version.profileJson.topicStrengths`。
- `publishGate`：建议由 version response 直接返回，避免前端自行用分数推断。
- `sourceDistillJobId`：来自 version response，用于 `补充资料再蒸馏` 回到 `/create?jobId=...`。
- 权限边界：只有 owner/reviewer 访问 version 时返回真实 `sourceDistillJobId`；公开 share 访问必须返回 `null`。

需要扩展 `personaVersionResponseSchema`：

```ts
type PersonaVersionResponse = {
  id: string;
  personaId: string;
  status: string;
  profileJson: Record<string, unknown>;
  previewIntro: string | null;
  recommendedQuestions: string[];
  sampleAnswers: string[];
  coverageScore: number | null;
  groundingScore: number | null;
  styleScore: number | null;
  riskScore: number | null;
  publishGate: {
    canPublishPublic: boolean;
    canSavePrivate: boolean;
    reasons: string[];
  };
  sourceDistillJobId: string | null;
  ownerDisplayStatus: "CANDIDATE" | "PRIVATE" | "PUBLIC" | null;
  personaHref: string | null;
  shareHref: string | null;
};
```

`补充资料再蒸馏` 跳转规则：

- 如果 `sourceDistillJobId` 存在，跳转 `/create?jobId={sourceDistillJobId}`，恢复原 intent/discovery/selected sources/pending extra sources。
- 如果 `sourceDistillJobId` 不存在，跳转 `/create?personaId={personaId}`，进入 legacy workbench，并提示旧版本无法恢复来源选择。

按钮规则：

| 条件 | 私用保存 | 公开分享 | 补资料 |
| --- | --- | --- | --- |
| preview gate 通过，publish gate 通过 | 可用 | 可用 | 可用 |
| preview gate 通过，publish gate 不通过 | 可用 | 禁用 | 可用 |
| version 已发布 | 可返回分享页 | 可返回分享页 | 可用 |

入口规则：

- `CANDIDATE` 从 `/profile` 点击进入 `/preview/:personaVersionId`，主操作是保存、公开或补资料。
- `PRIVATE` 从 `/profile` 点击仍进入 `/preview/:personaVersionId`，但文案是“私用对象”，主操作是继续聊天、补资料或公开。
- `PUBLIC` 从 `/profile` 点击进入 `/persona/:personaId`，分享入口进入 `/share/:slug`。
- preview/private chat 当前继续使用 `draft_version_preview` targetType 绑定 `personaVersionId`。
- 保存或公开后不复制 chat session，不迁移旧会话；聊天列表只恢复原会话。

## 7. Profile 页面改造

`/profile` 是 owner inventory，必须展示对象和进行中的蒸馏任务。

新增卡片状态：

| 状态 | 文案 | 操作 |
| --- | --- | --- |
| `QUEUED/CLAIMED/...` | `正在蒸馏` | 回到进度 |
| `NEEDS_MORE_SOURCES` | `资料还不够` | 补资料 |
| `FAILED` | `蒸馏失败` | 重试 |
| `CANDIDATE` | `待确认` | 进入预览 |
| `PRIVATE` | `已保存` | 打开私用对象 |
| `PUBLIC` | `已公开` | 打开公开对象 / 分享页 |

接口选择：

- V1 必须新增 `GET /v1/me/persona-inventory` 作为 `/profile` 的主数据源。
- `GET /v1/me/persona-distill-jobs` 可以保留给 `/create?jobId=` 恢复和调试，但不能替代 owner inventory。
- 进行中的 job 卡片点击后进入 `/create?jobId=...`。
- `NEEDS_MORE_SOURCES` 卡片点击后进入 `/create?jobId=...` 并恢复来源确认页。
- `CANDIDATE` 卡片点击后进入 `/preview/:personaVersionId`。
- `PRIVATE` 卡片点击后进入 `/preview/:personaVersionId` owner-only 私用对象体验。
- `PUBLIC` 卡片点击后进入 `/persona/:personaId`，辅助操作进入 `/share/:slug`。
- `CANDIDATE` 卡片必须提供 `放弃` secondary action。

Owner inventory response：

```ts
type PersonaInventoryItem = {
  itemType: "DISTILL_JOB" | "PERSONA_VERSION";
  displayStatus: "IN_PROGRESS" | "NEEDS_MORE_SOURCES" | "FAILED" | "CANDIDATE" | "PRIVATE" | "PUBLIC";
  personaId: string | null;
  personaVersionId: string | null;
  sourceDistillJobId: string | null;
  displayName: string;
  previewIntro: string | null;
  updatedAt: string;
  primaryAction: "CONTINUE_DISTILL" | "OPEN_PREVIEW" | "OPEN_PRIVATE_OBJECT" | "START_CHAT" | "OPEN_SHARE";
  primaryHref: string;
  secondaryActions: Array<"SAVE_PRIVATE" | "PUBLISH_PUBLIC" | "ADD_SOURCES" | "DISCARD" | "OPEN_SHARE">;
  shareSlug: string | null;
  canPublishPublic: boolean;
  canSavePrivate: boolean;
  qualitySummary: {
    coverageScore: number | null;
    styleScore: number | null;
    reasons: string[];
  };
};

type PersonaInventoryResponse = {
  groups: {
    inProgress: PersonaInventoryItem[];
    needsAttention: PersonaInventoryItem[];
    saved: PersonaInventoryItem[];
    public: PersonaInventoryItem[];
  };
  items: PersonaInventoryItem[];
};
```

Profile 分组展示建议：

- `待处理`：`IN_PROGRESS | NEEDS_MORE_SOURCES | FAILED | CANDIDATE`。
- `已保存`：`PRIVATE`。
- `已公开`：`PUBLIC`。
- `待确认` 必须排在 `待处理` 的前面，文案提示“还没保存”。

## 8. API Client 增量

`packages/api-client/src/personae.ts` 需要新增：

```ts
export const createDistillIntent = async (baseUrl: string, input: CreateDistillIntentRequest) => {};
export const discoverDistillSources = async (baseUrl: string, input: DistillSourceDiscoveryRequest) => {};
export const addDistillExtraSources = async (baseUrl: string, discoveryId: string, input: AddExtraSourcesRequest) => {};
export const createDistillJob = async (baseUrl: string, input: CreateDistillJobRequest) => {};
export const getDistillJob = async (baseUrl: string, jobId: string) => {};
export const listMyDistillJobs = async (baseUrl: string) => {};
export const listMyPersonaInventory = async (baseUrl: string) => {};
export const discardPersonaVersion = async (baseUrl: string, personaVersionId: string) => {};
```

旧方法处理：

- `createPersona` 保留给 legacy/manual workbench。
- `distillPersona` 保留给 legacy/manual workbench。
- 默认 H5 `/create` 不再使用 `createPersona` + `distillPersona` 作为主路径。

## 9. 前端分阶段落地

说明：下面是实现拆分，不是上线范围拆分。V1 可验收版本必须包含 `/create` 主链路、job polling、preview 质量信息、`/profile` active/incomplete job 恢复。
同时，V1 可验收版本必须包含 owner inventory：`SUCCEEDED` 未保存 candidate、private、public 都能从 `/profile` 找回。

### 阶段 1：只改状态和接口对接

- 增加 distill API client。
- `/create` 改为新状态机。
- 保留旧 workbench 作为高级入口。
- 增加 job polling。
- `/profile` 增加 active/incomplete job 基础恢复入口。
- `/profile` 接入 `GET /v1/me/persona-inventory`，至少展示 `IN_PROGRESS | NEEDS_MORE_SOURCES | CANDIDATE`。
- 成功后跳转现有 preview。

### 阶段 2：完善 source confirmation

- 增加 bucket 分组。
- 增加来源可信度和推荐理由。
- 增加缺失 bucket 提示。
- 增加补充 URL/text。

### 阶段 3：完善 preview 和 profile

- preview 增加质量信息卡和补资料入口。
- profile 完善 `PRIVATE | PUBLIC` 对象卡片、分享入口和 candidate 放弃入口。

## 10. 验收标准

- `/create` 默认不再先创建 persona。
- 用户输入对象后先走 intent 和 discovery。
- 用户能看到 source candidates 并确认来源。
- 用户确认来源后才创建 distill job。
- 前端能轮询 job 并展示每个状态。
- job 成功后能进入 `/preview/:versionId`。
- job `NEEDS_MORE_SOURCES` 能回到来源确认页。
- job `BLOCKED` 不会继续创建 persona。
- 旧 workbench 不影响新主流程。
- 前端调用的接口与后端计划中的 `persona-distill-*` endpoints 对齐。
- `/profile` 能恢复 active/incomplete jobs。
- `/profile` 能展示 `CANDIDATE | PRIVATE | PUBLIC` owner inventory。
- job `SUCCEEDED` 后未保存离开，用户仍能从 `/profile` 回到 `/preview/:versionId`。
- 私用对象从 `/profile` 进入 `/preview/:versionId` owner-only 体验，公开对象进入 `/persona/:personaId` 或 `/share/:slug`。
- `/history` 只展示 chat sessions，不承担对象库。
- `/preview` 能通过 `sourceDistillJobId` 回到原 job 来源上下文继续补资料。
