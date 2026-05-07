# 一键蒸馏 V2 产品缺失问题：蒸馏对象库与列表归属

日期：2026-04-28

## 1. 问题结论

这个问题成立。

当前方案已经定义了：

- 首页展示官方/精选对象。
- 聊天后进入聊天列表。
- 创建流程可以完成一键蒸馏并进入 preview。
- preview 可以保存私用或公开分享。
- `/profile` 可以恢复 active/incomplete distill job。

但当前方案没有完整定义：蒸馏完成后的对象，尤其是 `SUCCEEDED` 但用户还没有点击保存或公开的对象，应该进入哪个列表、如何再次打开、和聊天列表是什么关系。

这不是单纯增加一个列表页的问题，而是产品对象生命周期和列表归属缺失。

## 2. 当前页面职责边界

### 首页

首页是对象发现页，当前职责是展示官方/精选对象。

首页不应默认混入用户蒸馏对象，否则会混淆“平台推荐”和“我的对象”。后续可以增加“最近使用”或“我的最近对象”模块，但这不是 V1 必需。

### 聊天列表

聊天列表是会话列表，不是对象列表。

它只应该回答一个问题：我最近和谁聊过，以及从哪一条会话继续。

因此，如果用户蒸馏完成但没有开始聊天，这个对象不应该只依赖聊天列表找回。

### 我的

`/profile` 应该成为 owner 侧对象库。

它应该回答一个问题：我创建、蒸馏、保存、公开过哪些对象，以及每个对象现在处于什么状态。

## 3. 缺失问题列表

### 缺失 1：`/profile` 的 owner inventory 语义没有锁定

当前文档说 `/profile` 展示用户创建过的对象，也要求恢复 active/incomplete job，但没有明确 `/profile` 就是 owner 侧对象库。

需要明确：

- 首页不是我的对象库。
- 聊天列表不是我的对象库。
- `/profile` 是我的对象库和任务恢复入口。

`/profile` 至少需要分组展示：

- 进行中：已创建 distill job，仍在执行。
- 资料不足：job 停在 `NEEDS_MORE_SOURCES`。
- 待确认：job 已 `SUCCEEDED`，有 `resultVersionId`，但用户还没有保存或公开。
- 已保存：用户点击过 `保存到我的`，仅自己可用。
- 已公开：用户点击过 `公开分享`，生成 share 入口。

### 缺失 2：`SUCCEEDED` 但未保存的 candidate version 可能无处找回

当前流程是：

```text
job SUCCEEDED
  -> 跳转 /preview/:resultVersionId
  -> 用户决定保存或公开
```

缺失点是：如果用户在 preview 页关闭页面、返回首页、或者没有点击保存，系统是否仍然保留这个 candidate version 的可见入口。

产品规则应该改为：

- job `SUCCEEDED` 后，`resultVersionId` 立即进入 `/profile` 的“待确认”分组。
- 用户离开 preview 后，可以从 `/profile` 回到 `/preview/:resultVersionId`。
- 待确认对象一直保留，直到用户保存、公开、删除、或重新蒸馏生成新版本。

这样可以避免“蒸馏完成了，但对象找不到”的断层。

### 缺失 3：owner inventory 接口语义不足

`GET /v1/me/persona-distill-jobs` 只能解决任务恢复，不足以支撑完整对象库。

`/profile` 还需要拿到已完成对象、未保存 candidate、私用版本、公开版本、分享入口和主操作。

产品侧建议定义一个 owner inventory 数据语义，可以由以下两种方式实现：

- 方案 A：扩展 `GET /v1/me/personae`，让它聚合 distill jobs、candidate versions、private versions、published versions。
- 方案 B：新增 `GET /v1/me/persona-inventory`，专门服务 `/profile`。

推荐方案 B。原因是 `/profile` 需要展示的是产品态，不只是 persona 表记录；它要聚合 job、version、share、quality gate 和用户操作入口。

最小返回语义：

```ts
type PersonaInventoryItem = {
  itemType: "DISTILL_JOB" | "PERSONA_VERSION";
  displayStatus: "IN_PROGRESS" | "NEEDS_MORE_SOURCES" | "CANDIDATE" | "PRIVATE" | "PUBLIC";
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
};
```

### 缺失 4：preview chat 与保存后对象的关系未定义

当前 preview 页使用 draft preview chat。保存或公开后，如果聊天列表仍指向 draft preview，而 `/profile` 指向已保存对象，用户会看到两个入口概念：

- 聊天列表：继续一条 preview 会话。
- 我的对象：打开已保存对象。

这两个入口必须指向同一个对象体验，不能让用户感觉是两个对象。

V1 产品规则建议：

- `CANDIDATE` 对象从 `/profile` 点击后进入 `/preview/:personaVersionId`。
- `PRIVATE` 对象从 `/profile` 点击后仍进入 `/preview/:personaVersionId`，但 UI 文案不能继续叫“预览中”，而是 owner-only 的“私用对象”体验。
- `PUBLIC` 对象从 `/profile` 点击后进入 `/persona/:personaId`，分享动作进入 `/share/:slug`。
- preview/private chat 绑定 `personaVersionId`，当前技术上可以继续使用 `draft_version_preview` targetType；后续可重命名为 `owned_persona_version`。
- 保存私用或公开分享后，不迁移旧聊天会话，也不复制新会话。
- 同一个 `personaVersionId` 的展示状态从 `CANDIDATE` 变为 `PRIVATE` 或 `PUBLIC`。
- 聊天列表仍然是会话列表，点击后恢复原会话；页面文案按 version 最新状态展示。

这样 V1 不需要为私用对象新增聊天 targetType，也不会产生两套对象。技术上即使 URL 仍是 `/preview/:personaVersionId`，产品文案也必须按“待确认对象”或“私用对象”展示，而不是一直叫 preview。

## 4. 推荐产品方向

V1 不新增一个单独的“蒸馏对象列表页”。

推荐把 `/profile` 明确升级为“我的对象库”，并保持底部导航职责清晰：

- `聊天`：官方/精选对象发现与进入聊天。
- `创建`：一键蒸馏创建流程。
- `我的`：我的对象库和蒸馏任务恢复。

聊天列表 `/history` 保留为次级入口，可以从聊天页或我的页进入，但不作为用户端底部一级导航。

这样用户心智最清楚：

- 想找平台给我的对象，去首页。
- 想继续某段聊天，进入聊天列表次级页。
- 想找我自己蒸馏出来的对象，去我的。
- 想创建新对象，去创建。

## 5. 状态流转补充

```text
source confirmation
  -> create distill job
  -> IN_PROGRESS
  -> SUCCEEDED
  -> CANDIDATE version
  -> appears in /profile 待确认
  -> preview
  -> save private
  -> /profile 已保存
  -> /preview/:personaVersionId owner-only 私用对象

CANDIDATE version
  -> publish public
  -> /profile 已公开
  -> /persona/:personaId
  -> /share/:slug

CANDIDATE version
  -> add sources / re-distill
  -> /create?jobId=...

CANDIDATE version
  -> discard
  -> removed from /profile owner inventory
```

## 6. 对现有一键蒸馏方案的影响

需要补充到现有方案中的产品要求：

- `job SUCCEEDED` 不只是跳 preview，也必须让 candidate version 进入 owner inventory。
- `/profile` 不只恢复 active/incomplete job，还要展示 `CANDIDATE | PRIVATE | PUBLIC` 对象。
- `保存到我的` 是把 candidate 明确转成 private owned object 的动作。
- `公开分享` 是把 candidate 明确转成 public/shareable object 的动作。
- 聊天列表继续保持 session-centric，不承担对象库职责。
- 首页继续保持 official/featured discovery，不承担我的对象库职责。

## 7. V1 验收标准

- 用户蒸馏成功后，不保存直接离开，再进入 `/profile` 能看到“待确认”对象。
- 用户从“待确认”对象能回到 `/preview/:personaVersionId`。
- 用户点击“保存到我的”后，对象进入 `/profile` 的“已保存”分组，点击后进入 `/preview/:personaVersionId` 的 owner-only 私用对象体验。
- 用户点击“公开分享”后，对象进入 `/profile` 的“已公开”分组，点击后进入 `/persona/:personaId`，并能打开 `/share/:slug`。
- 用户只蒸馏但没有聊天时，聊天列表可以没有该对象，但 `/profile` 必须有。
- 用户聊过 preview 后，聊天列表展示对应会话；保存后不生成重复对象入口。
- 用户公开的自建对象不会自动进入首页精选，除非后续 admin/featured 机制单独处理。

## 8. 后续待决策

- `/profile` 是否需要把“待确认”放在最上方，并提示“还没保存”。
- 待确认 candidate 是否需要过期策略。V1 建议不自动过期，只提供删除。
- 是否新增 `GET /v1/me/persona-inventory`，还是扩展现有 `/v1/me/personae`。
