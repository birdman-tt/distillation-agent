# 前后端不同步排查

- 日期：2026-04-22
- 范围：`创建 / 我的 / 分享 / 登录`
- 结论：当前用户端与后端并非完全同步，且 `创建` 和 `分享产出` 已经影响主闭环；`我的` 与 `登录` 仍处于半壳状态。

## 1. 判断依据

- 当前 IAB 实际运行的用户端壳在 `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts`
- 需求边界以 `docs/product-design.md` 为准，尤其是：
  - V1 要做 `用户基于公开资料创建蒸馏对象 / 对象分享 / 对象公开或私用发布选择`（`docs/product-design.md:46-54`）
  - V1 不做 `用户端 reviewer 审核页 / 审核工作台`，审核后续放到独立 `admin` 项目（`docs/product-design.md:55-72`）

## 2. 总结

| 模块 | 当前结论 | 严重度 |
| --- | --- | --- |
| 创建 | 前端看起来能一路创建到预览，但后端要求资料先过审核，导致正常用户链路会卡在 `distill` | 高 |
| 我的 | 当前更像浏览器本地状态页，不是账号资产页；数据来源与后端用户模型不一致 | 中 |
| 分享 | 前端只接了 share 消费，没有接 share 生成；用户无法从创建链路产出可分享链接 | 高 |
| 登录 | 后端已有匿名、短信、微信、refresh 能力，前端只接了匿名会话 | 中 |

## 3. 创建

### 3.1 前端当前行为

- 创建页会先确保匿名会话存在，然后直接调用 `POST /v1/personae` 创建对象（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1904-1937`）
- 创建成功后，前端把 `personaId / name / positioning / tags` 直接写入 `localStorage`，作为后续“继续编辑”和“我的”页的数据来源（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1939-1944`）
- 添加资料时，前端直接调用：
  - `POST /v1/personae/:personaId/sources/text`（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1962-1984`）
  - `POST /v1/personae/:personaId/sources/url`（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1987-2009`）
- 点击“进入预览”时，前端直接调用 `POST /v1/personae/:personaId/distill`，默认认为资料补完即可生成预览（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2012-2025`）

### 3.2 后端当前行为

- `POST /v1/personae` 会创建一个 `PRIVATE + DRAFT` 的 persona，并同时创建首个 `DRAFT` 版本（`.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:468-569`）
- 文本资料入库后默认状态是 `PENDING_REVIEW`，不是可直接蒸馏（`.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:685-771`）
- URL 资料入库后默认状态同样是 `PENDING_REVIEW`（`.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:774-839`）
- `prepareDistillInput` 只会读取 `APPROVED` 的资料；如果没有任何已审核资料，会直接报错 `At least one approved source is required before distill`（`.worktrees/task1-bootstrap/apps/api/src/store/persona-store.ts:306-315`）
- 也就是说，`distill` 当前依赖 reviewer 审核前置（`.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts:197-236`）

### 3.3 不同步点

- 不同步 1：前端把“添加资料 -> 进入预览”设计成用户自助闭环，但后端仍把“资料审核通过”作为蒸馏前置条件
- 不同步 2：需求已明确 reviewer 不在用户端，但后端创建链路仍内嵌 reviewer 依赖，这会让用户端创建主流程失效
- 不同步 3：前端把当前对象保存在本地浏览器；后端真实状态是 `persona / version / source` 三层结构，二者不是同一套状态源

### 3.4 影响

- 当前正常用户即使完成“创建 + 补资料”，也可能在预览前卡死
- 创建成功是否能继续编辑，取决于本地 `localStorage` 是否还在，不取决于账号后端状态
- 这已经影响 V1 最核心的 `创建 -> 预览` 主闭环

## 4. 我的

### 4.1 前端当前行为

- “我的”页展示的身份文案来自本地 session；没有登录入口，只是把 `ANONYMOUS / USER / REVIEWER` 折叠成 `匿名体验 / 已登录`（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2154-2163`）
- “我的”页展示的对象来自 `localStorage` 里的 `hall-of-fame-current-persona*`（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2165-2176`）
- 草稿数和已发布数并不是账号维度统计，而是基于“当前这一个 persona 有没有 published version”硬推出来的 `0/1`（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2177-2188`）
- React 版的 `ProfileDashboard` 也是同一逻辑：先读本地 session，再读本地 persona，再请求单个 `personaId` 的状态（`.worktrees/task1-bootstrap/apps/client/src/features/profile/profile-dashboard.tsx:29-49`, `.worktrees/task1-bootstrap/apps/client/src/features/profile/profile-dashboard.tsx:112-183`）

### 4.2 后端当前行为

- 当前后端提供的是按 `personaId` 查询的：
  - `GET /v1/personae/:personaId/status`
  - `GET /v1/personae/:personaId/versions`
  - `GET /v1/personae/:personaId/sources`
  （`.worktrees/task1-bootstrap/apps/api/src/routes/personae/manage.ts:80-195`）
- 后端已经有明确的账号和所有权模型：
  - session 有 `ANONYMOUS / USER / REVIEWER`
  - persona 有 `creatorUserId`
  - 登录升级时支持把匿名资产转移到登录用户下（`.worktrees/task1-bootstrap/apps/api/src/store/auth-store.ts:121-142`, `.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:628-660`）
- 但当前仓内没有检出 `/v1/me`、`/v1/account`、`/v1/users/:id/personae` 这类账号资产聚合接口

### 4.3 不同步点

- 不同步 1：前端“我的”是账号页心智，但数据来源是浏览器本地缓存，不是后端账号资产
- 不同步 2：前端只展示“最近对象”，后端模型支持一个用户拥有多个 persona 和多个 version
- 不同步 3：后端虽然支持匿名资产在登录后迁移，但前端“我的”没有基于账号重新拉取资产，因此登录后仍可能只看到本地残留状态

### 4.4 影响

- 换设备、清缓存、换浏览器后，“我的”页会失真
- 同一用户创建多个对象后，“我的”仍无法反映真实资产
- “我的”页现在更像演示页，不足以承接发布、分享、继续编辑这类低频管理动作

## 5. 分享

### 5.1 前端当前行为

- 分享页已接 `GET /v1/shares/:shareSlug`，能消费已有 share link 并继续聊天（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1766-1816`）
- 但前端仓内未检出 `POST /v1/persona-versions/:personaVersionId/shares` 的调用；当前用户端没有“生成分享链接”动作
- 预览页上的“提交发布”按钮调用的是 `POST /v1/persona-versions/:personaVersionId/submit-publish-review`，不是生成分享（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2123-2133`）

### 5.2 后端当前行为

- 后端已提供 share 消费接口 `GET /v1/shares/:shareSlug`（`.worktrees/task1-bootstrap/apps/api/src/routes/shares.ts:6-14`）
- 后端也提供 share 生成接口 `POST /v1/persona-versions/:personaVersionId/shares`（`.worktrees/task1-bootstrap/apps/api/src/routes/persona-versions.ts:74-97`）
- 但 share 生成只允许 `PUBLISHED` 版本；如果版本不是 `PUBLISHED`，会报错 `Only published versions can create shares`（`.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:1405-1425`）
- 与此同时，前端当前“发布”动作只会把版本推进到 `PENDING_PUBLISH_REVIEW`，不会变成 `PUBLISHED`（`.worktrees/task1-bootstrap/apps/api/src/routes/persona-versions.ts:40-72`, `.worktrees/task1-bootstrap/apps/api/src/db/repositories/dynamic-persona-repository.ts:1177-1188`）

### 5.3 不同步点

- 不同步 1：前端只接了“打开别人分享的对象”，没接“把我创建的对象生成分享链接”
- 不同步 2：前端把“提交发布”当成接近完成的动作，后端语义其实只是进入待审状态
- 不同步 3：需求里有“对象分享”和“公开/私用发布选择”，但当前用户端既没有分享生成，也没有公开/私用选择

### 5.4 影响

- 当前用户创建的 persona 无法从用户端完成 `预览 -> 产出 share link -> 分享给别人`
- V1 的传播闭环只在官方 seed 对象上成立，在用户创建对象上并不成立

## 6. 登录

### 6.1 前端当前行为

- 当前用户端只自动调用 `POST /v1/auth/anonymous` 获取匿名会话（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:964-974`）
- `requestJson` 只会把本地 `accessToken` 带上，请求失败时直接报错；没有接 `refreshToken` 自动续期逻辑（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:936-962`）
- 前端仓内未检出以下用户登录接口的调用：
  - `POST /v1/auth/web/sms/request`
  - `POST /v1/auth/web/sms/verify`
  - `POST /v1/auth/wechat-miniapp/login`
  - `POST /v1/auth/refresh`
- 目前唯一额外接上的认证动作是 `/review` 页里的开发态 reviewer 登录，不属于用户端正式登录（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2200-2353`）

### 6.2 后端当前行为

- 后端已经提供：
  - 匿名会话 `POST /v1/auth/anonymous`
  - Web 短信验证码请求/校验 `POST /v1/auth/web/sms/request`、`POST /v1/auth/web/sms/verify`
  - 微信小程序登录 `POST /v1/auth/wechat-miniapp/login`
  - refresh `POST /v1/auth/refresh`
  （`.worktrees/task1-bootstrap/apps/api/src/routes/auth.ts:21-113`）
- 短信登录和微信登录都支持把匿名会话下的资产合并到正式账号（`.worktrees/task1-bootstrap/apps/api/src/routes/auth.ts:65-89`）

### 6.3 不同步点

- 不同步 1：后端登录体系已经有接口，前端用户端没有任何真实登录入口
- 不同步 2：后端支持匿名资产升级合并，前端没有触发这条链路
- 不同步 3：后端返回 `refreshToken`，前端保存了 session 但没有消费 refresh 能力

### 6.4 影响

- 当前用户只能匿名试玩，无法完成真正的账号升级
- 登录后继续管理历史 persona、跨设备找回资产的能力实际上还没成立

## 7. 额外发现

- 需求已经把 reviewer 能力移到独立 `admin` 项目，但当前 H5 壳里仍保留 `/review` 页面和 reviewer 登录、审核列表、审批动作（`.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:1489-1505`, `.worktrees/task1-bootstrap/apps/client/src/h5-app.ts:2200-2353`）
- 这不是本次排查主项，但它说明当前用户端和目标产品边界仍有历史残留

## 8. 当前最需要同步的顺序

- 第一优先：统一 `创建 -> 预览` 是否还依赖 reviewer 审核
- 第二优先：统一 `发布 -> 分享` 的真实状态机，明确用户端是否直接发布，还是先进入别的后台流程
- 第三优先：补齐“我的”页所需的账号资产接口，避免继续依赖 `localStorage` 伪装账号态
- 第四优先：决定 V1 登录是否上短信 / 微信之一，并把匿名资产升级链路真正接通
