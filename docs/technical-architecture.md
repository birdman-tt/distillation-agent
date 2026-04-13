# 名人堂小程序 V1 技术方案

- 日期：2026-04-10
- 状态：技术方案已收敛，待进入页面布局与实现计划
- 对应产品文档：`docs/product-design.md`

## 1. 技术目标

V1 需要满足以下目标：

- 一套后端服务，同时服务移动 Web 和微信小程序
- 用户在两个端上看到的核心产品能力保持一致
- 登录是少数存在平台差异的能力，其余业务接口统一
- “人物蒸馏”必须是可解释、可版本化、可回溯的数据流水线
- 前期尽量少维护两套前端业务逻辑

## 2. 关键结论

### 2.1 前端不是两套业务代码，而是两个运行目标

虽然产品上有 `移动 Web 端` 和 `微信小程序端`，但工程上不建议做两套独立前端。

推荐方案：

- 使用 `Taro + React + TypeScript` 作为前端主技术栈
- 一个前端工程同时编译到：
  - `h5`
  - `weapp`
- 平台差异通过 adapter 层处理，而不是业务层分叉

适合放在 adapter 层的差异：

- 登录
- 分享
- 文件/链接上传能力
- 路由与页面生命周期细节

不应该分叉的能力：

- 人物馆列表
- 对象详情
- 对话页
- 创建流程
- 收藏/发布/分享对象

结论：

`产品是两端，工程最好是一套前端业务代码 + 两个 target。`

### 2.2 后端维持单一 API 面

推荐方案：

- 统一一个 `API 服务`
- 统一一个 `Worker 服务`
- Web 和小程序共用业务接口
- 仅认证入口不同，登录成功后都换成后端自己的会话体系

也就是说：

- 不让业务接口直接依赖微信生态
- 微信只参与“小程序登录换取用户身份”这一层

### 2.3 “蒸馏人物”不要做成模型微调

V1 不建议做真正意义上的模型训练或 fine-tune。

推荐把“蒸馏”定义为一条结构化数据流水线：

1. 收集资料
2. 清洗与切块
3. 提取人物结构化画像
4. 建立可检索知识索引
5. 在对话时进行检索增强生成

这样做的好处：

- 可以解释“这段回答基于什么”
- 可以版本化对象
- 可以低成本重跑蒸馏
- 不会把产品绑死在某一个模型训练流程上

## 3. 推荐整体架构

### 3.1 工程结构

建议的 monorepo 结构如下：

```text
apps/
  api/                  # Fastify API 服务
  worker/               # 蒸馏、抓取、异步任务 worker
  client/               # Taro React 前端，编译 h5 + weapp
packages/
  contracts/            # zod schemas、DTO、接口约束
  domain/               # 纯业务模型、状态机、对象类型定义
  api-client/           # 给 h5/weapp 共用的请求客户端
  prompt-kit/           # 蒸馏与对话用 prompt 模板、输出 schema、workflow step contracts
  ui-tokens/            # 设计 token、常量、文案枚举
```

补充约束：

- `Mastra` 以内嵌 runtime 的方式接入 `apps/api` 和 `apps/worker`
- V1 不单独起一个新的 AI 产品控制面
- 主生产链路使用 `workflow-first`，不使用 `agent-first`

### 3.2 与当前仓库的关系

当前仓库是一个 LinkedIn 背调助手，已有的 `Fastify + TypeScript + monorepo` 思路可以复用，但不建议把这个新产品继续挂在 `linkedin-assistant` 的命名空间下。

建议二选一：

1. 新建独立 repo
2. 继续留在当前 monorepo，但新产品使用全新 workspace 名称和 app 目录

如果继续放在当前仓库，建议至少新开：

- `apps/api`
- `apps/worker`
- `apps/client`
- `packages/contracts`
- `packages/domain`
- `packages/api-client`

不要把“名人堂”功能硬塞进现有 `apps/service` 和 `packages/shared` 的语义里。

## 4. 前端技术方案

### 4.1 为什么选 Taro

选择理由：

- 一套 React 代码同时支持 H5 和微信小程序
- 能满足“登录有差异、业务无差异”的需求
- 更适合这种移动优先、端能力高度接近的产品

不推荐一开始就做：

- `Next.js H5 + 原生小程序` 两套独立业务实现

原因：

- 会过早引入双端重复开发
- 页面结构和状态管理容易慢慢漂移
- 你的产品当前不需要 SEO 驱动的复杂 SSR 体系

后续如果需要营销官网或公开分享落地页，再补一个独立 `site` 即可。

### 4.2 前端层次划分

前端建议拆成 4 层：

1. `pages`
   页面路由和页面装配
2. `features`
   人物馆、对象创建、对话、分享等业务模块
3. `services`
   调用后端接口，不直接写在页面里
4. `adapters`
   平台差异层

示意：

```text
apps/client/src/
  pages/
  features/
    hall/
    persona/
    chat/
    creation/
    share/
  services/
    auth/
    personae/
    chat/
  adapters/
    auth/
    share/
    upload/
    storage/
```

### 4.3 登录策略

V1 建议这样处理：

- 未登录用户也能浏览官方人物馆和试玩部分官方对话
- 只有在以下动作时才要求登录：
  - 创建对象
  - 保存聊天记录
  - 发布对象
  - 收藏对象

这样可以降低冷启动摩擦。

### 4.4 Web 与小程序的登录差异

#### Web

推荐：

- 手机号验证码登录，或者
- 匿名会话 + 后续绑定手机号

V1 不建议先做账号密码。

#### 微信小程序

推荐：

- 使用 `wx.login` 获取 code
- 后端完成 code 换 openid / unionid
- 后端映射到自己的用户体系
- 后端返回自己的 access token / refresh token

也就是说，小程序端只把微信当作“身份提供方”，后续所有业务接口仍然使用后端自己的 token。

### 4.5 分享能力

分享既是 adapter 能力，也是产品主闭环，不应只当成前端细节处理。

分享必须同时覆盖：

- 微信内传播
- 站外网页传播

因此建议拆成两层：

#### 4.5.1 统一分享身份

每个已发布对象版本都必须生成一个统一的外部身份：

- `share_slug`
- `persona_version_id`
- `canonical_url`
- `miniapp_path`

其中：

- `canonical_url` 用于网页传播、浏览器打开、搜索收录和分享卡落地
- `miniapp_path` 用于微信小程序内转发和微信生态内继续打开

结论：

`对象对外只有一个分享身份，H5 和小程序只是这个身份的两种承载入口。`

#### 4.5.2 跨端落地策略

推荐固定策略如下：

- 站外打开分享链接：默认进入 H5 分享落地页
- 微信内打开 H5 分享链接：优先引导“打开小程序继续聊”
- 小程序内转发：直接落到小程序对象页
- 无法打开小程序时：回退到 H5 对象页

这样可以同时满足：

- 微信传播效率
- 站外可访问性
- 对象页面的统一外部地址

#### 4.5.3 前端 adapter 职责

在这个前提下，分享 adapter 只负责平台执行层：

- H5：复制链接、浏览器分享、生成分享卡
- 小程序：`onShareAppMessage`、分享对象卡片、小程序路径参数

但分享内容模型是统一的：

- 对象 ID
- 对象版本号
- 对象标题
- 一句话人格说明
- 默认封面

后端还需要补一组分享元数据：

- 默认摘要文案
- 分享卡主标题
- 分享卡副标题
- 分享封面 URL
- 打开后的首轮推荐问题

## 5. 后端技术方案

### 5.1 API 层

推荐保留当前仓库已有的：

- `Fastify`
- `TypeScript`
- `zod`

理由：

- 轻量
- 明确
- 易于给 H5 和小程序统一提供 JSON API
- 现有项目已经有可复用经验

### 5.2 数据存储

V1 不建议继续使用 SQLite 作为主存储。

推荐：

- `PostgreSQL`
- `pgvector`
- 对象存储（S3 兼容，或腾讯云 COS）

理由：

- 用户、对象、版本、消息、分享、审核状态都需要关系型约束
- 蒸馏资料需要 embedding 检索
- 对象版本与公开分享更适合数据库建模
- 后续并发和部署弹性明显优于 SQLite

### 5.3 异步任务

人物蒸馏不适合做成纯同步接口。

推荐：

- `worker` 独立进程
- `Redis + BullMQ` 或等价队列
- `Mastra workflow` 作为蒸馏和评测的内部运行时

承担以下任务：

- 拉取 URL 内容
- 清洗文本
- 切块和 embedding
- 人物画像提取
- 生成预览问答
- 审核或质量打分
- 生成分享卡素材

补充约束：

- `distill` 主链路使用显式 workflow，不使用自由 agent loop
- `chat` 主链路也使用显式 workflow，但运行在 `api` 服务内，避免额外网络跳转
- 审核、发布、分享和状态机仍由业务后端持有真相

### 5.4 API 设计原则

业务接口统一走 `/v1` 前缀，分成 7 组：

- `auth`
- `personae`
- `persona-versions`
- `sources`
- `chats`
- `shares`
- `reviews`

建议的核心接口：

```text
POST   /v1/auth/web/sms/request
POST   /v1/auth/web/sms/verify
POST   /v1/auth/wechat-miniapp/login
POST   /v1/auth/refresh

GET    /v1/personae/featured
GET    /v1/personae/:personaId
POST   /v1/personae
PATCH  /v1/personae/:personaId
POST   /v1/personae/:personaId/publish
GET    /v1/personae/:personaId/status
GET    /v1/personae/:personaId/versions

GET    /v1/persona-versions/:personaVersionId
POST   /v1/persona-versions/:personaVersionId/shares

POST   /v1/personae/:personaId/sources/text
POST   /v1/personae/:personaId/sources/url
DELETE /v1/personae/:personaId/sources/:sourceId
POST   /v1/personae/:personaId/distill

POST   /v1/chats
POST   /v1/chats/:chatId/messages
GET    /v1/chats/:chatId

GET    /v1/shares/:shareSlug

GET    /v1/reviews/sources?status=PENDING_REVIEW
POST   /v1/reviews/sources/:sourceId/approve
POST   /v1/reviews/sources/:sourceId/reject
GET    /v1/reviews/personae?status=PENDING_PUBLISH_REVIEW
POST   /v1/reviews/personae/:personaId/approve-publish
POST   /v1/reviews/personae/:personaId/reject-publish
```

### 5.5 会话模型与版本模型

后端统一维护自己的用户和会话，不让平台身份直接渗透到业务层。

建议表结构核心包括：

- `users`
- `auth_identities`
- `sessions`
- `personae`
- `persona_versions`
- `persona_sources`
- `persona_chunks`
- `chats`
- `chat_messages`
- `share_links`
- `persona_feedback`
- `jobs`

其中最关键的是 `persona_versions`。

原因：

- 用户公开分享出去的对象，必须指向一个可复现的版本
- 蒸馏对象后续可能继续编辑，但旧分享不能失真
- 对话、分享、审核都应该围绕版本而不是裸对象展开

`share_links` 需要至少承载：

- `share_slug`
- `persona_version_id`
- `channel_hint`
- `canonical_url`
- `miniapp_path`
- `is_active`

版本模型还需要额外明确两件事：

1. `personae` 是对象容器
2. `persona_versions` 是真正参与发布、分享、聊天的不可变快照

建议补充以下规则：

- `personae.current_draft_version_id`
- `personae.current_published_version_id`
- 所有公开分享必须绑定 `current_published_version_id`
- 编辑资料不会覆盖旧版本，而是生成新的 draft/candidate version
- 对话默认命中公开版本；预览对话显式命中 draft version

## 6. “蒸馏人物信息”技术方案

## 6.1 先定义“蒸馏”是什么

V1 的蒸馏不是训练一个新的专属模型，而是生成两个东西：

1. `结构化人物画像`
2. `可检索资料索引`

其中：

- 结构化人物画像负责“像不像”
- 可检索资料索引负责“有没有依据”

### 6.2 资料输入

V1 只支持两种来源：

- 用户粘贴的文本
- 用户提供的公开网页链接

官方对象则使用平台维护的资料包。

每条资料都要记录：

- 来源类型
- 来源 URL 或文本摘要
- 作者或发布主体
- 发布时间
- 上传者
- 抓取时间
- 清洗后的正文
- 可用状态
- 来源级别
- 可信度分

### 6.2.1 URL 导入安全边界

URL 导入是用户可控输入，不能只把它当成“抓网页正文”。

V1 至少需要这些安全和幂等边界：

- 仅允许 `http` / `https`
- DNS 解析后阻断私网、回环、本地链路和保留地址段
- 跟随重定向时每一跳都重新校验协议和目标地址
- 限制响应大小、抓取时长和重试次数
- 限制允许的内容类型，默认只接收可提纯为正文的网页文本
- 为规范化 URL 生成去重键，避免重复抓同一来源
- 为每次抓取保留请求结果和失败原因，便于审计和重试

这些规则应在写入 `persona_sources` 前执行，不要把风险 URL 直接丢进后续流水线。

### 6.2.2 证据模型

虽然前端不要求逐条展示出处，但后端必须保留“可追溯证据模型”。

推荐把最小证据单元定义为：

`source document -> section/span -> normalized quote`

也就是说，系统内部真正参与 grounding 的，不应该只是一个大 chunk，而应该是带定位信息的引用片段。

建议每条证据至少包含：

- `source_id`
- `document_id`
- `source_type`
- `source_kind`
- `author`
- `published_at`
- `title`
- `url`
- `section_label`
- `span_start`
- `span_end`
- `normalized_quote`
- `trust_score`
- `review_status`
- `dedupe_group_id`
- `conflict_group_id`

其中：

- `source_kind` 至少分为：
  - `PRIMARY`
  - `SECONDARY`
  - `SUMMARY`
- `review_status` 至少分为：
  - `PENDING_REVIEW`
  - `APPROVED`
  - `REJECTED`

这些字段的目的不是直接暴露给用户，而是支持：

- 对话 grounding
- 冲突检测
- 质量评估
- 人工审核
- 版本重建

### 6.2.3 资料审核状态机

你已经确定官方对象允许“半自动抓公开网页后再人工筛选”，这意味着资料本身必须进入审核状态机，而不是抓完直接进入蒸馏。

推荐流程：

1. 抓取网页
2. 提取正文和元数据
3. 写入 `persona_sources`，状态为 `PENDING_REVIEW`
4. 人工通过后改为 `APPROVED`
5. 只有 `APPROVED` 资料允许进入 embedding、画像提取和正式蒸馏
6. 被拒绝资料标记为 `REJECTED`，保留审计记录

这样可以避免：

- 脏数据污染人物画像
- 重复转载材料影响权重
- 低质量内容进入对话检索链路

这里要补一句：审核不只是状态字段，还必须有最小操作面。

至少需要：

- 待审核资料列表
- approve / reject API
- 审核意见和操作人记录
- 用户公开对象的发布审核入口

### 6.3 资料处理流水线

推荐分成 6 个步骤：

#### 步骤 1：采集与清洗

- 抓取网页正文
- 去掉导航、广告、评论区、脚注噪音
- 统一编码和换行
- 基础去重
- 提取标题、作者、发布时间、来源站点
- 建立去重分组与冲突分组候选

输出：

- `normalized_source_text`

#### 步骤 2：切块与索引

- 按语义段落切块
- 控制每块长度
- 生成 embedding
- 写入向量索引
- 为 chunk 绑定可引用的 span 和 source 元数据

输出：

- `persona_chunks`

#### 步骤 3：人物结构化提取

从资料里提取出稳定画像，不直接拿原文拼 prompt。

建议抽取这些字段：

- `summary`
- `era_or_context`
- `roles`
- `key_experiences`
- `core_beliefs`
- `reasoning_patterns`
- `speaking_style`
- `signature_phrases`
- `topic_strengths`
- `topic_unknowns`
- `taboos_or_boundaries`

输出：

- `persona_profile.json`

#### 步骤 4：预览问答生成

基于人物画像和资料，生成：

- 一句话人格说明
- 3 个推荐问题
- 3 个示例回答

这部分用于：

- 对象详情页
- 创建后的预览页
- 分享卡文案

#### 步骤 5：质量打分

至少打 4 个分：

- `coverage_score`
- `style_score`
- `grounding_score`
- `risk_score`

当以下情况出现时，不允许直接公开发布：

- 资料过少
- 来源不可追溯
- 风格过弱
- 风险过高

#### 步骤 6：生成候选版本

蒸馏成功后先生成一个不可变候选版本：

- `persona_version`
- 绑定画像 JSON
- 绑定资料快照
- 绑定示例问题
- 绑定默认开场白

注意：

- 这一步生成的是 `candidate version`，不是直接公开发布
- 公开发布是后续业务动作，需要通过资料和风控校验
- `share_slug` 只能在明确的 published version 上生成

### 6.4 对话时怎么使用这些蒸馏结果

运行时不要把所有资料直接塞给模型。

推荐对话链路：

1. 用户发问
2. 判断问题类型
   - 人物观点
   - 人生建议
   - 历史经历
   - 某主题判断
3. 从 `persona_profile` 和 `chunks` 中检索最相关证据
4. 组装 prompt
5. 生成结构化输出

建议模型输出格式：

```json
{
  "answer": "像该人物会说的话",
  "basis": [
    {
      "sourceId": "src_123",
      "snippet": "相关资料片段"
    }
  ],
  "basisSummary": {
    "mode": "SUPPORTED",
    "summary": "主要依据该人物关于秩序和统一的公开表述"
  },
  "inferenceLevel": "grounded",
  "conflictDetected": false,
  "refusalReason": null
}
```

其中 `inferenceLevel` 可以有：

- `grounded`
- `inferred`
- `insufficient_evidence`

其中：

- `basis` 是后端内部证据列表，用于 grounding、审核和调试
- `basisSummary` 是给前端展示的依据摘要层，不要求逐条展开原始引用，但必须告诉用户这段回答依据了什么
- `conflictDetected` 表示当前问题命中了相互冲突的资料
- `refusalReason` 在拒答时返回原因枚举

前端至少需要明确展示：

- 这句话有依据
- 依据大致来自哪些观点/资料方向
- 这句话是基于风格的推演
- 这题资料不足，不能硬装成“这个人一定会这么说”

#### 6.4.1 回答判定规则

对话层必须先做回答判定，再决定生成方式，不能直接把检索结果交给模型自由发挥。

推荐使用以下三段式规则：

##### A. 输出 `grounded`

满足以下条件时，允许输出 `grounded`：

- 命中当前问题的高相关证据
- 命中证据来自已审核通过的资料
- 至少有一条证据能直接支撑回答主张
- 没有明显冲突资料命中

此时要求：

- 回答优先复述或转述资料所支持的观点
- 风格可以模仿，但不能改变核心结论
- 不允许把没有直接证据支撑的判断说成既定事实

##### B. 输出 `inferred`

满足以下条件时，允许输出 `inferred`：

- 有部分相关资料，但没有直接回答当前问题
- 当前问题落在 `topic_strengths` 或邻近主题内
- 没有命中高风险禁区
- 没有明显冲突资料

此时要求：

- 回答可以做风格化推演
- 必须显式带上“基于该人物一贯观点/风格推测”的约束语气
- 不允许给出过度确定的断言
- 前端必须将其展示为“风格化推演”

##### C. 输出 `insufficient_evidence`

出现以下任一情况，必须输出 `insufficient_evidence`：

- 没有命中足够相关的资料
- 只命中低质量或未审核资料
- 问题明显超出 `topic_strengths`
- 命中 `topic_unknowns` 或 `taboos_or_boundaries`
- 问题要求人物对不存在的具体事件、数字或细节表态
- 问题属于产品明确排除的高风险决策场景

此时要求：

- 模型明确说明“现有资料不足，无法可靠回答”
- 可以给出更适合追问的方向
- 不允许继续用风格化措辞硬答

#### 6.4.2 冲突资料处理规则

冲突不是普通的资料不足，必须单独处理。

当检索命中两组以上互相冲突、且都具有中高可信度的资料时：

- `conflictDetected` 必须为 `true`
- 输出优先降级为 `insufficient_evidence`
- 回答需要明确说明“现有资料存在冲突，无法把某一说法包装成该人物的确定立场”

只有在冲突点不影响回答主结论时，才允许保留 `grounded` 或 `inferred`。

#### 6.4.3 拒答原因枚举

`refusalReason` 建议固定为有限枚举，避免后续判断漂移：

- `NO_RELEVANT_EVIDENCE`
- `OUT_OF_SCOPE`
- `CONFLICTING_EVIDENCE`
- `HIGH_RISK_DOMAIN`
- `BLOCKED_BY_BOUNDARY`

这样后端、前端和审核系统可以共用同一套语义。

### 6.5 为什么不做 fine-tune

V1 不做 fine-tune 的原因：

- 迭代慢
- 成本高
- 难以给“依据”做解释
- 每次改资料都要重训练，不适合早期产品
- 很难处理对象版本化和回滚

V1 最合理的路线是：

`结构化画像 + RAG + 输出约束`

后续如果某些官方对象特别热门，再考虑把高频官方人物做更深的专用优化。

## 7. 聊天生成策略

### 7.1 运行时编排

V1 推荐将 LLM 主链路固定为：

- `Mastra workflow` 编排蒸馏和评测
- `Mastra workflow` 编排 chat runtime
- 主生产路径不启用开放式 agent loop

原因：

- 便于追踪 step 级输入输出
- 便于把业务真相和 LLM 执行分层
- 便于回放失败案例和做 prompt evaluation
- 更容易限制成本和时延

### 7.2 模型层

聊天模型和蒸馏模型可以是同一个供应商，但职责不同：

- 蒸馏阶段：偏抽取、归纳、结构化
- 对话阶段：偏风格表达、受控生成
- embedding 阶段：偏向量化和召回稳定性

不要直接让一个 prompt 同时完成“提取画像 + 聊天回答”。

推荐采用：

- 单一供应商
- 三种能力拆分：`distillModel`、`embeddingModel`、`chatModel`

### 7.3 Prompt 结构

推荐固定为 4 段：

1. 系统边界
   - 你是蒸馏人格对象，不是真人
   - 不能装作有明确依据时却没有依据
2. 人物画像
   - summary
   - beliefs
   - style
3. 检索证据
   - top-k 资料片段
4. 输出 schema
   - answer
   - basis
   - basisSummary
   - inferenceLevel
   - conflictDetected
   - refusalReason

### 7.3.1 Prompt 硬约束

Prompt 里必须加入以下硬规则，不能只靠产品文案约束：

- 当判定为 `grounded` 时，只能在证据支持范围内回答
- 当判定为 `inferred` 时，必须使用推测性语气，不能伪装成直接史实或原话
- 当判定为 `insufficient_evidence` 时，必须拒答，不能继续角色扮演式补全
- 当 `conflictDetected = true` 且影响主结论时，优先拒答
- 不允许为了“更像这个人”而覆盖检索结果或边界规则
- V1 聊天只允许单轮一次生成，不引入隐藏 rewrite pass

### 7.4 对话记忆

V1 的记忆不要做得太重。

建议：

- 单个 chat session 保留最近若干轮消息
- 不把所有长期对话都写回人物画像
- 用户创建对象后，编辑资料必须重新生成新版本

也就是说：

`聊天记忆` 和 `人物蒸馏版本` 是两套东西，不能混。

## 8. 合规与审核技术落点

产品文档已经明确了边界，技术上要有对应落点。

必须有的能力：

- 创建对象时的来源声明
- URL 来源记录
- 资料审核操作面
- 对象状态机
  - `draft`
  - `processing`
  - `ready`
  - `published`
  - `rejected`
- 版本状态机
  - `draft`
  - `ready_for_review`
  - `approved`
  - `published`
  - `superseded`
- 敏感对象拦截
- 资料不足拦截
- 分享前版本冻结
- `personae.current_draft_version_id`
- `personae.current_published_version_id`

至少要留一个人工兜底口：

- 官方对象人工上架
- 用户公开对象人工抽检

## 9. 推荐开发顺序

不要按“前端、后端、小程序”分段开发，而按产品闭环开发。

推荐顺序：

1. 后端基础设施
   - 用户、对象、版本、来源、聊天、分享表
   - 统一 contracts
   - 版本状态机和审核状态机
2. 官方人物馆 + 最小对话闭环
   - featured 列表
   - 对象详情
   - 最小聊天
   - 版本化分享落地页
3. 审核能力与资料输入闭环
   - 审核列表
   - approve / reject API
   - 文本/URL 输入
   - URL 安全边界
4. 蒸馏 workflow 与预览闭环
   - distill workflow
   - candidate version
   - 预览页
5. 发布与增强对话闭环
   - publish review
   - share slug
   - grounded / inferred / insufficient_evidence
6. 双端适配
   - h5 登录
   - weapp 登录
   - 分享 adapter

## 10. 最终建议

技术路线我建议定成下面这一版，不再摇摆：

- 前端：`Taro + React + TypeScript`
- 双端：`H5 + 微信小程序`
- 后端：`Fastify + TypeScript + zod`
- LLM runtime：`Mastra workflow-first`
- 数据库：`PostgreSQL + pgvector`
- 异步：`worker + queue`
- 存储：`对象存储`
- 蒸馏：`结构化画像 + 向量检索 + 受控对话生成`

一句话总结：

`一套后端，一套前端业务代码，两种端适配；一条蒸馏流水线，两类输出资产：人物画像和可检索证据。`
