# 一键蒸馏 V2 产品交互方案

- 日期：2026-04-28
- 状态：产品交互收敛稿，等待 reviewer subagent 审查
- 关联方案：`docs/superpowers/plans/2026-04-27-nuwa-inspired-one-click-distill-v2.md`
- 范围：只定义用户侧产品体验、状态和交互，不定义具体代码实现

## 1. 产品目标

一键蒸馏 V2 的目标是把当前“手动创建对象、手动添加资料、同步点击预览”的流程，改成普通用户能理解的创建闭环：

```text
输入对象
  -> 系统找资料
  -> 用户确认来源
  -> 后台蒸馏
  -> 预览聊天
  -> 保存或分享
```

用户不需要理解 profile、RAG、worker、模型分工、资料分桶。用户只需要知道：

- 我想创建谁。
- 系统找到了哪些资料。
- 我是否认可这些资料。
- 蒸馏是否成功。
- 这个对象聊起来像不像。

## 2. 产品原则

- 创建页不再是后台表单，而是一个“把对象唤出来”的向导。
- 用户确认来源必须保留，这是信任建立点，也是风险控制点。
- 后台蒸馏必须异步，不能让用户在一个按钮上长时间等待。
- 页面默认解释“结果基于公开资料的风格化推断”，但不把技术细节放在首屏中心。
- review/admin 能力不放在当前用户端项目里，用户端只展示创建、预览、我的、分享。
- 首页是官方/精选对象发现页，聊天列表是会话列表，`/profile` 是用户自己的对象库。
- 蒸馏成功后的 candidate 不能只存在于 preview 页面，必须进入 `/profile` 的待确认分组，保证用户离开后还能找回。

## 2.1 真人对象边界

本方案更新并取代旧文档中“活人名人蒸馏不做”的绝对表述。V2 允许蒸馏公开资料充分、风险可控的现实公众人物，但必须按风险策略区分处理。

允许进入普通创建流：

- 企业家、创作者、作者、主播、公开表达者。
- 历史人物。
- 资料稳定、争议不以政治或现实伤害为主的公众人物。

不允许进入普通创建流：

- 现实政治人物。
- 敏感公共事件核心人物。
- 强意识形态或现实社会动员对象。
- 主要因违法犯罪、伤害、诈骗、极端争议出名的对象。
- 搜索结果主要由不可验证爆料、攻击、隐私信息构成的对象。

`NEED_REVIEW` 在用户端 V1 的处理：

- 可以展示为“暂不支持普通创建”，不进入 source discovery，不创建 job。
- 后续如果接入 admin 项目，可以改为进入人工审核队列。
- 当前用户端不能把 `NEED_REVIEW` 当作 `ALLOW` 继续创建，也不能公开分享。

## 3. 用户侧主流程

### 步骤 1：输入对象

页面目标：让用户说出“我要蒸馏谁”。

用户看到：

- 标题：`你想让谁开口？`
- 输入框：`输入人物、角色或作品中的对象`
- 可选用途：
  - `聊天陪伴`
  - `学习理解`
  - `决策视角`
  - `角色扮演`
- 可选重点：
  - `说话方式`
  - `思考方式`
  - `经历背景`
  - `价值判断`
- 主按钮：`查找资料`

系统动作：

- 调用 `POST /v1/persona-distill-intents`。
- 返回对象标准化、对象类型、风险判断、资料覆盖提示。

成功后进入“资料发现中”。

风险阻断时：

- 不创建 persona。
- 不创建 distill job。
- 展示阻断原因的用户版文案。
- 提供返回修改对象名。

示例文案：

```text
这个对象暂时不能创建。
它可能涉及现实政治、敏感公共事件或高风险争议。你可以换一个公开资料更稳定的对象。
```

### 步骤 2：资料发现中

页面目标：让用户知道系统正在找资料，不需要手动等待空白页。

用户看到：

- 进度状态：`正在查找公开资料`
- 分桶提示：
  - `长文 / 公开文章`
  - `访谈 / 视频 / 播客`
  - `表达习惯`
  - `外部评价`
  - `关键选择`
  - `时间线`
- 轻提示：`找到资料后，你可以自己删除或补充。`

系统动作：

- 调用 `POST /v1/persona-distill-source-discovery`。
- Kimi 或搜索工具执行资料发现。
- 后端 sanitizer 负责清洗、去重、分桶、风险标记、可信度判断。

异常状态：

- 搜索失败：展示 `资料查找失败，请重试`。
- 资料不足：进入来源确认页的空结果/弱结果模式，允许用户手动添加资料，但不直接进入蒸馏。
- 风险升级：如果 discovery 发现对象高风险，进入阻断状态。

空结果/弱结果模式：

- 仍然展示 6 个 bucket 覆盖条，全部或部分为缺失态。
- 来源列表展示空状态：`还没有找到可用资料，你可以补充公开链接或粘贴资料。`
- 用户添加资料后，页面只做基础计数和格式校验；真实可用性由后端 pending source 校验决定。
- 继续按钮只有在 pending source 校验后满足最低资料要求才可启用。

### 步骤 3：确认资料来源

页面目标：用户确认“这些资料可以用来蒸馏”。

用户看到：

- 顶部摘要：
  - `找到 8 条资料`
  - `覆盖 4 / 6 个维度`
  - `一手资料 3 条`
- bucket 覆盖条：
  - 已覆盖：高亮
  - 缺失：灰态
- 来源列表：
  - 标题
  - 来源站点
  - bucket
  - `PRIMARY / SECONDARY / SUMMARY`
  - 可信度
  - 推荐原因
  - 是否默认选中
- 用户操作：
  - 勾选 / 取消来源
  - 添加 URL
  - 粘贴文本
  - 校验新增资料
  - 重新查找
  - 确认开始蒸馏

必须展示的风险提示：

```text
请只使用公开资料，或你确认有权使用的内容。蒸馏结果是基于资料的风格化推断，不代表本人真实发言。
```

继续按钮启用条件：

- 真人对象：
  - 可用来源不少于 3 条。
  - 至少覆盖 2 个 bucket。
  - 至少有 1 条 `PRIMARY` 或 `SECONDARY`。
- 虚拟人物：
  - 可用来源不少于 2 条。
  - 至少覆盖 2 个 bucket。
  - 至少有 1 条 `canon` 或 `official_*` 来源。

资料不足时：

- 不允许开始蒸馏。
- 明确告诉用户缺什么。

示例文案：

```text
还差一点资料。
目前缺少能体现说话方式或长线思考的资料。你可以补充访谈、长文或作品原文。
```

用户新增资料的持久化边界：

- 用户在来源确认页添加 URL/text 后，前端必须调用后端把它保存为 discovery 级别的 pending extra source。
- pending extra source 归属于 `discoveryId`，不是纯前端 state，也不是等 job 创建时才提交的一次性 payload。
- 后端对 pending extra source 做 URL 安全、内容格式、资料风险、sourceKind、bucket、trustLevel 判断。
- 校验通过的 pending extra source 会作为可选 source candidate 返回，并参与按钮启用条件。
- 校验失败的 pending extra source 保留错误原因，但不能被选中用于 job。
- 刷新页面、返回 `/create?jobId=` 或从 `NEEDS_MORE_SOURCES` 回来时，必须能恢复这些 pending extra sources。

### 步骤 4：蒸馏进度

页面目标：把异步 job 的等待过程变成可理解的进度，而不是“加载中”。

用户看到：

- 标题：`正在蒸馏`
- 当前步骤：
  - `整理资料`
  - `判断资料风险`
  - `抽取表达和判断方式`
  - `合成人格画像`
  - `生成聊天协议`
  - `检查质量`
  - `准备预览`
- 进度条
- 已完成节点
- 弱提示：`这个过程可能需要几十秒。`

系统动作：

- 调用 `POST /v1/persona-distill-jobs` 创建 job。
- 轮询 `GET /v1/persona-distill-jobs/:jobId`。
- job 成功后跳转预览聊天。

状态映射：

| Job 状态 | 用户文案 | 用户动作 |
| --- | --- | --- |
| `QUEUED` | `排队中` | 等待 |
| `CLAIMED` | `开始处理` | 等待 |
| `INGESTING` | `整理资料` | 等待 |
| `EXTRACTING` | `抽取表达和判断方式` | 等待 |
| `SYNTHESIZING` | `合成人格画像` | 等待 |
| `VALIDATING` | `检查质量` | 等待 |
| `PERSISTING` | `准备预览` | 等待 |
| `SUCCEEDED` | `蒸馏完成` | 写入 owner inventory 的待确认分组，并自动进入 preview |
| `NEEDS_MORE_SOURCES` | `资料还不够` | 返回来源确认页补资料 |
| `BLOCKED` | `暂时不能创建` | 返回输入页 |
| `FAILED` | `蒸馏失败` | 重试或返回来源确认页 |

`SUCCEEDED` 的产品约束：

- `resultVersionId` 必须立即进入 `/profile` 的“待确认”分组。
- 用户关闭 preview 或离开页面后，可以从 `/profile` 回到 `/preview/:resultVersionId`。
- 待确认对象一直保留，直到用户保存私用、公开分享、删除，或重新蒸馏生成新版本。

### 步骤 5：预览聊天

页面目标：让用户判断“像不像”，不是让用户读一份报告。

用户看到：

- 私聊式聊天界面。
- 对象先发一句开场。
- 输入框。
- 右侧或下方弱信息卡：
  - 资料覆盖度
  - 风格相似度
  - 可问方向
  - 弱 bucket 提示
- 操作：
  - `保存到我的`
  - `公开分享`
  - `补充资料再蒸馏`

信息卡数据来源：

- 资料覆盖度来自 `persona_versions.profile_json.sourceSummary.bucketCoverage`，并由 version response 返回。
- 风格相似度来自 `persona_versions.style_score`。
- 可问方向来自 `persona_versions.recommended_questions` 和 `profile_json.topicStrengths`。
- 弱 bucket 提示来自 `profile_json.sourceSummary.weakBuckets`。
- publish gate 状态来自 version response 的质量分和风险状态；前端不自行推断。

默认不展示：

- 长篇来源列表。
- 技术 trace。
- 模型名。
- 大段 profile JSON。

用户觉得“不像”时：

- 提供入口：`补充资料再蒸馏`。
- 返回来源确认页，保留已选来源和用户新增资料。

补资料再蒸馏协议：

- owner 或 reviewer 访问 `GET /v1/persona-versions/:id` 时必须返回 `sourceDistillJobId`。
- 公开 share 访问不需要恢复创建上下文，`sourceDistillJobId` 必须返回 `null`。
- 点击 `补充资料再蒸馏` 后跳转 `/create?jobId={sourceDistillJobId}`。
- `/create?jobId=` 通过 job response 恢复 intent、discovery、已选来源、pending extra sources 和缺失资料原因。
- 如果 version 没有 `sourceDistillJobId`，只能回到高级编辑入口 `/create?personaId=...`，并提示“旧版本无法恢复来源选择”。

### 步骤 6：保存或分享

用户可以选择：

- `仅自己使用`
- `公开分享`

公开分享需要满足 publish gate。

如果 preview 可以通过但 publish gate 不通过：

- 允许保存为私用。
- 不允许公开分享。
- 告诉用户原因。

示例文案：

```text
这个对象可以先自己使用，但还不能公开分享。
原因：资料覆盖不足，公开版本需要更多可追溯来源。
```

保存后的入口规则：

- `CANDIDATE`：待确认对象，出现在 `/profile` 的“待确认”，主入口是 `/preview/:personaVersionId`。
- `PRIVATE`：用户点击 `仅自己使用` 后，出现在 `/profile` 的“已保存”，主入口仍是 `/preview/:personaVersionId`，但页面文案必须是 owner-only 的“私用对象”，不能继续表现为“未保存预览”。
- `PUBLIC`：用户点击 `公开分享` 后，出现在 `/profile` 的“已公开”，主入口是 `/persona/:personaId`，分享入口是 `/share/:slug`。
- 保存或公开后，不复制 preview chat，不迁移旧 chat session；同一个 `personaVersionId` 的展示状态变化即可。

放弃待确认对象：

- `CANDIDATE` 对象必须提供 `放弃` 操作。
- 放弃后从 `/profile` owner inventory 移除，不能再从普通用户入口打开。
- 已保存或已公开对象的删除/下架策略不在 V1 范围，后续单独设计。

## 4. 需要替换的当前产品流程

当前创建页流程：

```text
填名称 / 简介 / 风格
  -> 创建 persona
  -> 手动添加资料
  -> 点击进入预览
  -> 同步调用 /v1/personae/:personaId/distill
  -> 跳转 preview
```

V2 目标流程：

```text
输入对象名 / 用途 / 重点
  -> intent 风险判断
  -> source discovery
  -> 用户确认来源
  -> 创建 async distill job
  -> job progress
  -> preview chat
  -> 保存或分享
```

旧的手动资料 workbench 可以保留为高级编辑入口，但不再是默认创建路径。

## 5. 页面信息架构

### `/create`

承载完整一键蒸馏入口。

内部状态：

- `subject_entry`
- `intent_checking`
- `intent_blocked`
- `intent_needs_review`
- `discovering_sources`
- `source_confirmation`
- `extra_source_checking`
- `creating_job`
- `distill_progress`
- `needs_more_sources`
- `distill_failed`

恢复协议：

- `/create?jobId=...` 加载时必须调用 `GET /v1/persona-distill-jobs/:jobId`。
- job response 必须包含恢复 UI 所需的快照：intent、discovery、source candidates、selected source ids、pending extra sources、missing requirements、quality scores、error。
- 如果 job 是 `NEEDS_MORE_SOURCES`，页面恢复到 `source_confirmation`，保留之前选择和用户补充资料。
- 如果 job 是 `FAILED`，页面恢复到 `distill_failed`，允许重试或返回来源确认页。
- 如果 job 是 `SUCCEEDED`，直接跳转 `/preview/:resultVersionId`。

### `/preview/:personaVersionId`

承载蒸馏成功后的待确认预览，以及保存后的 owner-only 私用对象体验。

能力：

- 加载 candidate/private version。
- 创建 draft preview chat。
- 允许保存私用。
- 允许公开分享。
- 允许返回补资料。
- public 对象不以 preview 作为主入口，主入口是 `/persona/:personaId`，分享入口是 `/share/:slug`。

### `/history`

聊天会话列表，是次级入口，不进入底部一级导航。

职责：

- 展示用户已经聊过的会话。
- 点击后恢复对应 chat session。
- 不展示未聊天的蒸馏对象。
- 不承担“我的对象库”职责。

### `/profile`

展示用户自己的对象库和蒸馏任务。

页面职责：

- 展示进行中的 distill job。
- 展示资料不足、失败、待确认、已保存、已公开对象。
- 支持从待确认对象回到 preview。
- 支持从已保存对象进入 owner-only 私用对象体验。
- 支持从已公开对象进入公开对象页或分享页。
- 支持从资料不足任务回到来源确认页。

需要新增展示状态：

- `进行中`
- `资料不足`
- `蒸馏失败`
- `待确认`
- `已保存`
- `已公开`

V1 要求：

- `/profile` 必须使用 owner inventory 语义，不只是 persona 表或 chat session 列表。
- 推荐新增 `GET /v1/me/persona-inventory` 作为唯一 profile 数据源。
- 进行中的 job 点击后进入 `/create?jobId=...`。
- `NEEDS_MORE_SOURCES` job 点击后进入 `/create?jobId=...` 并恢复来源确认页。
- `SUCCEEDED` 但未保存的 job/result version 点击后进入 `/preview/:personaVersionId`。
- 私用对象点击后进入 `/preview/:personaVersionId` owner-only 体验。
- 公开对象点击后进入 `/persona/:personaId`，并提供 `/share/:slug` 辅助入口。

### `/share/:slug`

不变，继续承接已发布版本。

## 6. 产品状态和异常

| 场景 | 产品表现 |
| --- | --- |
| 对象高风险 | 不进入资料发现，解释为什么不能创建 |
| 找不到资料 | 引导用户手动添加资料 |
| 资料覆盖不足 | 禁用开始蒸馏，展示缺失 bucket |
| 用户添加的资料高风险 | 标记不可用，不进入蒸馏 |
| 蒸馏 job 失败 | 允许重试或返回来源确认页 |
| 蒸馏质量不足 | `NEEDS_MORE_SOURCES`，提示补资料 |
| 蒸馏完成但用户未保存 | 进入 `/profile` 待确认分组，可回到 preview |
| preview 通过但 publish 不通过 | 允许私用，不允许公开分享 |
| 用户离开进度页 | 回到 `/profile` 或 `/create?jobId=` 后可恢复，V1 必须支持 |
| `NEED_REVIEW` 风险 | 用户端按暂不支持普通创建处理，不进入 job |

## 7. 用户侧不展示的内容

这些内容只进内部 trace 或 debug，不展示给普通用户：

- 模型调用细节。
- Minimax planner tool calls。
- DeepSeek 原始输出。
- Kimi 原始 search context。
- 完整 `PersonaProfileV2`。
- evidence span 原文全量。
- 风险模型细节。

用户侧只展示：

- 来源标题和摘要。
- 覆盖度。
- 可信度。
- 缺失资料提示。
- 可理解的失败原因。

## 8. 与后端接口的产品映射

| 用户动作 | 后端接口 | 页面状态 |
| --- | --- | --- |
| 输入对象并点击查找资料 | `POST /v1/persona-distill-intents` | `intent_checking` |
| intent 允许继续 | `POST /v1/persona-distill-source-discovery` | `discovering_sources` |
| 展示候选来源 | 无新增调用，使用 discovery response | `source_confirmation` |
| 用户添加 URL/text | `POST /v1/persona-distill-discoveries/:discoveryId/extra-sources` | `source_confirmation` |
| 恢复创建进度 | `GET /v1/persona-distill-jobs/:jobId` | `distill_progress` / `source_confirmation` / preview |
| 我的页查看对象库 | `GET /v1/me/persona-inventory` | profile |
| 用户确认开始蒸馏 | `POST /v1/persona-distill-jobs` | `creating_job` |
| 轮询进度 | `GET /v1/persona-distill-jobs/:jobId` | `distill_progress` |
| job 成功 | 写入 owner inventory 并跳转 `/preview/:resultVersionId` | profile/preview |
| 加载预览信息卡 | `GET /v1/persona-versions/:id` | preview |
| 从预览补资料 | `GET /v1/persona-versions/:id` 返回 `sourceDistillJobId` 后跳转 `/create?jobId=` | preview |
| 保存私用 | `POST /v1/persona-versions/:id/publish` with `PRIVATE` | profile |
| 公开分享 | `POST /v1/persona-versions/:id/publish` with `PUBLIC` | share/profile |
| 放弃待确认对象 | `POST /v1/persona-versions/:id/discard` | profile |

## 9. 验收标准

- 用户不需要手动先创建 persona 才能找资料。
- 用户必须先确认来源，才能开始蒸馏。
- 蒸馏等待过程有明确进度和可恢复状态。
- 资料不足不会生成弱对象。
- 风险阻断不会创建 persona/version。
- 预览聊天优先判断“像不像”，不是展示系统说明。
- 私用和公开分享有不同门禁。
- 当前用户端不再出现 review/admin 页面入口。
- `/profile` 可以恢复 active/incomplete distill job。
- `/profile` 可以展示 `CANDIDATE | PRIVATE | PUBLIC` 对象。
- 用户蒸馏成功后即使未保存，离开再回来也能在 `/profile` 找到待确认对象。
- 用户只蒸馏但没聊天时，聊天列表可以为空，但 `/profile` 必须有对象入口。
- 首页不会自动混入用户自建对象，除非后续 admin/featured 机制单独处理。
- 预览页可以通过 `sourceDistillJobId` 返回原来源上下文继续补资料。
