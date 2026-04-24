# 非登录范围整改清单

- 日期：2026-04-22
- 范围：`创建 / 我的 / 分享`
- 不包含：`登录 / 短信验证码 / 微信登录 / refresh token`
- 适用阶段：当前用户端联调与闭环修正
- 本文优先级：高于当前 `docs/implementation-plan.md` 中和 `review / 登录 / 发布审核` 相关的旧口径

## 1. 口径先锁定

后续实现窗口先不要再讨论以下 6 件事，直接按本文执行：

1. 当前阶段不做登录门禁，继续以匿名 session 作为用户端默认身份。
2. 当前阶段不做用户端 review，也不依赖 reviewer 才能完成创建和分享。
3. 创建主链路必须闭环为：`创建对象 -> 添加资料 -> 蒸馏预览 -> 仅自己使用 / 公开分享`。
4. “仅自己使用” 和 “公开分享” 都是用户端动作，不再先进入 `PENDING_PUBLISH_REVIEW`。
5. “我的” 必须改成基于当前 session 的真实资产页，不能再依赖 `localStorage` 伪造账号态。
6. 分享链路必须闭环为：`预览页做出公开分享选择 -> 立即得到 share link -> 他人可打开 share 页面继续聊天`。

## 2. 目标产品态

### 2.1 创建链路目标

1. 用户进入创建页，匿名 session 自动建立。
2. 用户创建 persona。
3. 用户添加文本或 URL 资料。
4. 用户点击“去预览”，系统直接蒸馏出可预览版本。
5. 用户在预览页看到：
   - 一句话简介
   - 推荐问题
   - 示例回答
   - 当前资料数量
6. 用户有两个明确动作：
   - `仅自己使用`
   - `公开分享`

### 2.2 “仅自己使用”目标

- 当前版本保留为用户自己的可继续编辑/继续试聊版本
- 不生成 share link
- “我的”里能看到该对象处于 `私用中` 或 `草稿/私用` 状态

### 2.3 “公开分享”目标

- 当前预览版本直接进入 `PUBLISHED`
- 自动生成 primary share
- 前端立即拿到 `shareSlug + canonicalUrl`
- 用户可直接跳转到分享页或复制分享链接
- “我的”里能看到该对象处于 `已公开` 状态

### 2.4 “我的”目标

- 基于当前 session 的真实 persona 资产返回
- 至少展示：
  - 对象列表
  - 每个对象的最近状态
  - 草稿数
  - 已公开数
  - 继续编辑入口
  - 已公开对象的分享入口

## 3. 需要覆盖的旧口径

以下旧逻辑在当前阶段一律暂停执行：

- `submit-publish-review`
- 用户端 `/review`
- 资料先 reviewer 审核再蒸馏
- 发布前必须进入 `PENDING_PUBLISH_REVIEW`
- “创建/发布前触发登录门禁”
- `approved_sources >= 5` 这类当前会阻塞主闭环的硬阈值

说明：

- 这些能力不是永久删除，而是从“当前用户端闭环”中拿掉
- 后续若恢复审核或登录，统一放到下一轮产品范围里重接

## 4. 状态机整改

### 4.1 当前阶段推荐状态语义

- `personae.status`
  - `DRAFT`：刚创建，尚未形成可预览版本
  - `READY`：已蒸馏出可预览/可私用版本
  - `PUBLISHED`：已有公开分享版本
- `persona_versions.status`
  - `DRAFT`：创建时自动生成的初始版本
  - `CANDIDATE`：蒸馏完成后的预览版本
  - `PUBLISHED`：公开分享后的正式版本
  - 当前阶段不再进入 `PENDING_PUBLISH_REVIEW`
- `personae.listing_status`
  - `PRIVATE`：仅自己使用
  - `UNLISTED`：已公开分享，但不进广场

### 4.2 当前阶段推荐流转

1. 创建 persona 后：
   - `personae.status = DRAFT`
   - `personae.listing_status = PRIVATE`
   - `current_draft_version_id = 初始版本`
2. 蒸馏成功后：
   - 新版本 `status = CANDIDATE`
   - `personae.status = READY`
   - `current_draft_version_id = 新蒸馏版本`
3. 选择“仅自己使用”后：
   - 保持 `personae.listing_status = PRIVATE`
   - 保持 `personae.status = READY`
   - 不创建 share
4. 选择“公开分享”后：
   - 目标版本 `status = PUBLISHED`
   - `personae.status = PUBLISHED`
   - `personae.listing_status = UNLISTED`
   - `current_published_version_id = 该版本`
   - 自动创建 primary share

## 5. 后端整改清单

### 5.1 P0：去掉用户端创建链路里的 reviewer 依赖

涉及文件：

- `.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts`
- `.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
- `.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts`

- [ ] 把当前用户端提交的文本资料默认落为可蒸馏状态，不再阻塞在 `PENDING_REVIEW`
- [ ] 把当前用户端提交的 URL 资料默认落为可蒸馏状态，不再阻塞在 `PENDING_REVIEW`
- [ ] 保留 `reviewStatus` 字段，但当前用户端路径统一按“自动通过”处理
- [ ] `prepareDistillInput` 改为可直接消费当前用户端提交的资料
- [ ] `distill` 失败信息从“需要已审核资料”改成真实可执行错误，如“至少需要一条资料”

建议实现口径：

- 当前阶段最小改法是：创建资料时直接写 `APPROVED`
- 不要保留“前端显示能蒸馏、后端实际要 reviewer 才能蒸馏”的中间态

### 5.2 P0：增加 session 资产聚合接口，替代“我的”页本地假数据

建议新增接口：

- `GET /v1/me/personae`

返回最小字段：

- `personaId`
- `displayName`
- `status`
- `listingStatus`
- `currentDraftVersionId`
- `currentPublishedVersionId`
- `primaryShareSlug`
- `primaryShareUrl`
- `updatedAt`

涉及文件：

- `.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts` 或新增 `routes/me.ts`
- `.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
- `.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts`

- [ ] 基于当前 access token 识别 actor
- [ ] 返回当前 actor 拥有的 persona 列表，而不是单个 `personaId/status`
- [ ] 列表按 `updatedAt desc` 排序
- [ ] 同时返回聚合统计：`draftCount`、`publishedCount`
- [ ] 已公开对象若有 primary share，一并返回 share 元数据

### 5.3 P0：用直接发布接口替代 publish review

建议新增接口：

- `POST /v1/persona-versions/:personaVersionId/publish`

请求体：

```json
{
  "visibility": "PRIVATE" | "PUBLIC"
}
```

返回体最小字段：

- `personaVersionId`
- `status`
- `visibility`
- `personaStatus`
- `listingStatus`
- `share` 可空

涉及文件：

- `.worktrees/task1-bootstrap/apps/api/src/routes/persona-versions.ts`
- `.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts`
- `.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts`
- `packages/contracts/src/persona-versions.ts`
- `packages/contracts/src/shares.ts`

- [ ] 新增 direct publish 接口，不再让用户端调用 `submit-publish-review`
- [ ] `visibility = PRIVATE` 时不创建 share，仅更新 persona/version 状态
- [ ] `visibility = PUBLIC` 时把版本置为 `PUBLISHED`
- [ ] `visibility = PUBLIC` 时自动生成 primary share，并在响应中直接返回
- [ ] 确保重复点击“公开分享”时幂等返回已有 primary share

### 5.4 P1：保留但隔离 review 路由

涉及文件：

- `.worktrees/task1-bootstrap/apps/api/src/routes/*review*`
- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`

- [ ] review 后端接口可继续保留，但不再作为当前用户端链路依赖
- [ ] 用户端不再引用 reviewer 登录、待审资料、待审发布任何接口

## 6. 前端整改清单

### 6.1 P0：创建页改成真正可闭环

涉及文件：

- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`
- `.worktrees/task1-bootstrap/apps/client/src/pages/create/index.tsx`
- `.worktrees/task1-bootstrap/apps/client/src/features/creation/create-persona-form.tsx`

- [ ] 创建成功后仍可保留本地状态兜底，但不能再把它当作“我的”的唯一数据源
- [ ] 资料列表里去掉 `reviewStatus` 作为主状态文案
- [ ] 资料添加成功后，统一反馈为“已添加，可用于预览”
- [ ] “去预览”调用成功后必须稳定跳到预览页，不能再出现 reviewer 相关报错

### 6.2 P0：预览页改成两个明确动作

涉及文件：

- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`
- `.worktrees/task1-bootstrap/apps/client/src/pages/create/preview.tsx`

- [ ] 删除“提交发布审核”按钮和对应文案
- [ ] 改成两个按钮：
  - `仅自己使用`
  - `公开分享`
- [ ] `仅自己使用` 调用新的 `/publish` 接口，`visibility = PRIVATE`
- [ ] `公开分享` 调用新的 `/publish` 接口，`visibility = PUBLIC`
- [ ] 公开成功后展示：
  - `canonicalUrl`
  - 进入分享页按钮
  - 返回“我的”按钮
- [ ] 私用成功后展示：
  - 返回“我的”按钮
  - 继续编辑按钮

### 6.3 P0：“我的”页改成真实资产页

涉及文件：

- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`
- `.worktrees/task1-bootstrap/apps/client/src/pages/profile/index.tsx`
- `.worktrees/task1-bootstrap/apps/client/src/features/profile/profile-dashboard.tsx`

- [ ] 页面初始化改为请求 `GET /v1/me/personae`
- [ ] 草稿数、已公开数改为后端真实统计
- [ ] 展示 persona 列表，不再只展示“最近对象”
- [ ] 每个对象至少有一个主动作：
  - 草稿/私用对象：`继续编辑`
  - 已公开对象：`查看分享`
- [ ] 当列表为空时，显示真正的空态，不再依赖 `localStorage`
- [ ] 若本地残留有旧 `hall-of-fame-current-persona*`，仅作为迁移兜底，不作为主数据源

### 6.4 P1：移除当前用户端的 review 入口残留

涉及文件：

- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`

- [ ] 删除 `/review` 页面 route 暴露
- [ ] 删除 reviewer 登录按钮和 reviewer 状态区
- [ ] 删除用户端任何“审核入口”文案和跳转

### 6.5 P1：分享页补充与“我的”联动

涉及文件：

- `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`
- `.worktrees/task1-bootstrap/apps/client/src/pages/share/index.tsx`
- `.worktrees/task1-bootstrap/apps/client/src/features/share/share-landing.tsx`

- [ ] 公开分享成功后，可从“我的”直接跳到 `/share/:slug`
- [ ] 分享页展示使用的对象信息与“我的”返回的 share 元数据保持一致
- [ ] 分享页不承接编辑功能，只保留消费与聊天

## 7. 推荐联调顺序

按这个顺序做，返工最少：

1. 后端先去掉 `distill` 的 reviewer 前置依赖
2. 后端补 `GET /v1/me/personae`
3. 后端补 direct publish 接口
4. 前端改创建页和预览页
5. 前端改“我的”页资产加载
6. 前端清理 review 入口残留
7. 前后端联调 `创建 -> 私用` 闭环
8. 前后端联调 `创建 -> 公开分享 -> 分享页打开` 闭环

## 8. 逐条验收标准

### 8.1 创建闭环

- [ ] 匿名用户可直接创建 persona
- [ ] 添加 1 条文本资料后即可成功蒸馏预览
- [ ] 添加 1 条 URL 资料后即可成功蒸馏预览
- [ ] 创建和预览过程中不会出现 reviewer 相关报错

### 8.2 私用闭环

- [ ] 预览页点击“仅自己使用”后返回成功状态
- [ ] “我的”页能看到该对象状态为草稿/私用
- [ ] 可从“我的”重新进入继续编辑

### 8.3 公开分享闭环

- [ ] 预览页点击“公开分享”后立即返回 share link
- [ ] `canonicalUrl` 可直接打开
- [ ] 他人在分享页可继续聊天
- [ ] “我的”页可看到该对象状态为已公开
- [ ] “我的”页可直接进入分享页

### 8.4 我的页

- [ ] 清空 `localStorage` 后，只要 session 仍在，“我的”页仍能正确加载资产
- [ ] 同一 session 创建两个对象后，“我的”页能同时看到两个对象
- [ ] 草稿数和已公开数与列表实际数量一致

## 9. 与旧实施计划的冲突说明

当前阶段以下条目暂不执行：

- `docs/implementation-plan.md:235-238`
- `docs/implementation-plan.md:240-275`
- `docs/implementation-plan.md:417-418`
- `docs/implementation-plan.md:436`

当前阶段以下条目继续执行，但需要改口径：

- `docs/implementation-plan.md:433-437`

改成：

- [ ] 创建页收集对象名、资料、蒸馏重点
- [ ] 预览页展示候选版本的人设、推荐问题、示例回答
- [ ] 支持“仅自己使用 / 公开分享”
- [ ] 公开分享时直接生成版本级 share
- [ ] 不经过用户端 review，不增加登录门禁
