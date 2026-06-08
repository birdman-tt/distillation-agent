# 项目功能与技术路线演进文档

- 生成日期：2026-04-27
- 历史范围：`1b8acee` 到 `0f5e339`
- 最新功能 HEAD：`0f5e339 feat: add retrieval planner researcher pipeline`
- 口径说明：主文档只基于已提交 commit；开发中方向只在“下一阶段观察点”中描述，避免把历史事实和未落地方案混写。

## 1. 阅读方式

这份文档按三层组织，分别服务不同回溯场景：

- **阶段路线**：用于复盘项目技术路线如何演进，优先看第 3 节。
- **功能索引**：用于按功能追溯相关页面、后端能力和 commit，优先看第 4 节。
- **commit 明细**：用于审计每个 commit 到底加入了什么，优先看第 8 节。

原始需求里的“线性文档”保留在第 8 节，但不把它作为唯一主线。原因是聊天、创建、分享、持久化、可观测性这些能力都横跨多个 commit；只按 commit 读，后期做功能回溯会需要重新拼图。

## 2. 当前架构快照

基于 `0f5e339`，项目已经形成一个面向 H5/小程序的 monorepo：

```text
apps/
  api/       Fastify API，承载人物、聊天、创建、审核、分享、实时连接、trace 等接口
  client/    H5/小程序前端业务代码，目前以 H5 壳和页面级组件为主
  worker/    异步任务 worker，承载蒸馏、资料抓取、主动消息等任务
packages/
  contracts/      zod schema、接口 DTO、跨端合同
  domain/         人物、版本、聊天、资料、审核、分享等领域模型
  api-client/     前端调用 API 的共享客户端
  prompt-kit/     聊天和蒸馏 prompt、输出 schema
  deepseek-client/ DeepSeek LLM 调用封装
  runtime-env/    运行时环境变量读取
  ui-tokens/      H5 视觉 token 和设计常量
tools/
  chat-trace-viewer/ 本地 chat trace 查看器
infra/
  docker-compose 与部署编排
```

核心链路可以概括为：

```text
H5 页面
  -> packages/api-client
  -> apps/api routes
  -> contracts/domain 校验与建模
  -> chat workflow / planner / retrieval / researcher / repositories
  -> LLM runtime / pgvector / Postgres / worker / realtime hub
```

## 3. 阶段路线总览

| 阶段 | commit 范围 | 前端变化 | 后端变化 | 架构意义 |
| --- | --- | --- | --- | --- |
| 0. 文档和路线定调 | `1b8acee` - `9d0e7f6` | 暂无页面实现 | 暂无运行时代码 | 明确 mobile first、workflow-first、DeepSeek、后端合同优先 |
| 1. Monorepo 和后端合同打底 | `b6e0e08` - `6b346f2` | H5/小程序入口占位 | API、contracts、domain、chat/persona/review/share/auth 路由、worker scaffold | 从文档进入可运行工程，确立 API + worker + shared packages 分层 |
| 2. H5 页面壳和消费端页面成型 | `85bc79f` - `c67ba46` | 首页、创建、预览、分享、审核、聊天面板、本地 H5 shell | API 与前端客户端打通，修正 HTML serving | 页面级产品闭环开始出现 |
| 3. 真实 LLM 聊天和 persona-first 体验 | `02b9749` - `5afd921` | H5 聊天页持续收敛为 chat-first | 聊天 workflow 接入 DeepSeek，prompt 从问答转向人格表达 | 产品从静态体验转向真实模型对话 |
| 4. 私聊式 H5 重构 | `daf805d` - `4732e56` | bottom shuttle nav、首页 carousel、persona messaging thread、辅助页面统一 | 后端变化较少 | 前端路线从“产品介绍页”转为“私聊入口和聊天线程” |
| 5. 规格、登录、Postgres 持久化 | `6efd61f` - `09a019e` | 聊天流程和官方人物展示更新 | 动态人物、聊天、user shadow 等进入 Postgres；官方 seed 持久化 | 从内存 demo 进入可保留状态的应用 |
| 6. 本地开发、部署和消费者页面补齐 | `4558663` - `f53d945` | profile 页、consumer surfaces、页面文案和展示完善 | migrate、Docker、Caddy、部署环境配置完善 | 项目开始具备本地/部署/文档化运维能力 |
| 7. 匿名聊天历史和记忆上下文 | `38bea9c` | 聊天页可承接匿名历史 | `/me`、chat repository、chat memory、非登录修复 | 降低登录前体验门槛，聊天成为可持续会话 |
| 8. Chat trace 可观测性 | `1fc8902` | 新增本地 trace viewer 工具 | trace collector、repository、internal API、schema | 开始能解释和调试一次模型回复的内部过程 |
| 9. Realtime planner 和主动消息基础 | `9f83ca7` | chat panel 承接实时/主动消息基础 | realtime route/hub、presence、PG listener、MiniMax planner、主动消息 worker | 技术路线开始从 workflow-only 走向 realtime + planner + tool/agent 基础 |
| 10. Retrieval-first 与 Researcher 链路 | `0f5e339` | 聊天发送体验区分消息送达和 AI 正在输入 | pgvector 表、Qwen embedding、user_memory_facts、Fast Planner、Kimi Researcher、research plan sanitizer | 聊天上下文从大 prompt/规则猜测转为检索增强 + 低延迟 planner + 最新信息研究链路 |

## 4. 功能索引

| 功能 | 页面级入口 | 后端/数据入口 | 关键 commit | 回溯重点 |
| --- | --- | --- | --- | --- |
| 官方人物馆 / 首页 | `pages/home`、Hall carousel | `personae/featured`、official seed | `320f3a5`、`85bc79f`、`ec38a37`、`09a019e`、`4558663` | 官方人物如何从 seed API 变成首页 carousel 入口 |
| Persona 聊天 | `features/chat/chat-panel`、`h5-app` persona view | `routes/chats`、chat workflow、prompt-kit、DeepSeek、chat repository、retrieval、Kimi researcher | `320f3a5`、`6b346f2`、`02b9749`、`5ee9a13`、`6da4282`、`38bea9c`、`1fc8902`、`9f83ca7`、`0f5e339` | 聊天从 seeded demo 到真实 LLM、历史、trace、realtime、retrieval/researcher 的演进 |
| 创建人物 | `pages/create`、`features/creation`、`pages/create/preview` | `personae/manage`、`persona-versions`、`sources`、worker distill | `a0c05a9`、`85bc79f`、`4732e56`、`4558663` | 创建、预览、审核、发布的闭环边界 |
| 审核与发布 | `pages/review`、review dashboard | `routes/reviews`、`persona-versions`、review domain | `a0c05a9`、`85bc79f`、`4732e56`、`4558663` | 后台审核能力如何补齐到页面 |
| 分享链路 | `pages/share`、share landing | `routes/shares`、version-level share contract | `a0c05a9`、`85bc79f`、`4732e56`、`4558663` | 分享的是 persona/version，不是聊天记录 |
| 个人页 / Profile | `pages/profile`、profile dashboard | 主要依赖 personae/chat/auth 数据 | `4558663` | 消费端从单一聊天扩展到用户侧管理面 |
| 登录 / 会话 / 匿名态 | 暂无完整登录页，聊天页承接匿名体验 | `routes/auth`、`routes/me`、actor session、user shadow | `a0c05a9`、`0666160`、`f664fd3`、`38bea9c` | 从 auth guardrails 到匿名聊天历史，再到后续正式登录方案 |
| 动态内容持久化 | 页面无单独入口，支撑所有动态能力 | Postgres schema、repositories、migrate、pgvector | `3c08c32`、`09a019e`、`38bea9c`、`1fc8902`、`9f83ca7`、`0f5e339` | 从内存 store 迁移到持久化数据模型，并扩展到向量检索和长期记忆 |
| Worker / 蒸馏 / 异步任务 | 创建和审核链路间接受益 | distill job、source ingest、chat proactive job | `6b346f2`、`0666160`、`9f83ca7` | 资料处理和主动消息从 API 同步链路中拆出 |
| Chat trace / 调试工具 | `tools/chat-trace-viewer` | internal chat traces route、trace repository、planner/research artifacts | `1fc8902`、`9f83ca7`、`0f5e339` | 模型回复过程开始可观测，并能复盘检索、联网研究和最终 prompt |
| Retrieval / Embedding | 无独立页面入口，服务聊天链路 | `chat_message_embeddings`、`persona_*_embeddings`、Qwen embedding、chat retrieval repository | `0f5e339` | 聊天上下文从最近历史扩展为 chat memory、persona chunks 和 user facts 的组合检索 |
| Kimi Researcher | 无独立页面入口，服务最新信息问题 | `services/kimi`、research plan、web context sanitizer | `0f5e339` | 最新信息由专门 researcher 查证，再交给 DeepSeek 生成用户可见回复 |
| 部署与本地开发 | 无页面入口 | Dockerfile、compose、Caddy、migrate、dev-all | `4558663`、`f53d945` | 从本地开发脚本走向统一容器部署 |

## 5. 页面级演进

| 页面 / 视图 | 演进路径 | 当前定位 |
| --- | --- | --- |
| 首页 / Hall | `85bc79f` 创建首页入口，`89c4e3c` 移动端壳重设，`ec38a37` 转成 persona carousel launcher，`4558663` 补 consumer surface | 首屏让用户选择一个想聊的人物，而不是阅读产品说明 |
| Persona 聊天页 | `85bc79f` chat panel scaffold，`02b9749` 接入真实 DeepSeek runtime，`5ee9a13` 调整 persona-first 回复，`6da4282` 改为 messaging thread，`38bea9c` 支持匿名历史，`9f83ca7` 加 realtime/planner 基础，`0f5e339` 区分消息送达和 AI 正在输入 | 核心体验页，承载人格对话、历史、实时状态、retrieval 和后续 tool/agent 能力 |
| 创建人物页 | `85bc79f` 创建表单 scaffold，`a0c05a9` 后端创建/审核/发布 API，`4558663` 优化 consumer surface | 轻创作者提交公开资料和创建 persona 的入口 |
| 创建预览页 | `85bc79f` 建立 preview 页面，`4732e56` 与私聊式系统统一 | 创建后判断 persona 是否可发布的中间态 |
| 审核页 | `85bc79f` review dashboard scaffold，`a0c05a9` 增加 review route，`4558663` 页面完善 | 管理创建对象的审核和发布流程 |
| 分享页 | `85bc79f` share landing scaffold，`a0c05a9` 增加 share route，`4732e56` 调整为 private chat system 风格 | 承接分享来的用户继续聊同一个 persona/version |
| 个人页 / Profile | `4558663` 新增 profile dashboard 和页面入口 | 给用户侧对象、历史或状态管理留出的管理面 |
| 本地 H5 壳 | `3ea3a6c` 新增本地 H5 shell，`c67ba46` 修正 HTML serving，`a531fc7` 建立 bottom shuttle nav | 本地调试和 H5 端体验承载层 |
| Chat Trace Viewer | `1fc8902` 新增工具目录和 viewer | 本地查看聊天 trace，用于调试 prompt、上下文、模型调用和回复过程 |

## 6. 后端能力演进

| 能力层 | 形成过程 | 复盘价值 |
| --- | --- | --- |
| API routes | `320f3a5` personae/chats，`a0c05a9` auth/feedback/reviews/shares/manage，`38bea9c` me，`1fc8902` internal trace，`9f83ca7` realtime | 可以按 route 回溯每个产品能力第一次出现的时间点 |
| Contracts | `b6e0e08` 初始 DTO，后续在 chats/personae/reviews/shares/chat-tools/chat-traces 扩展 | 前后端共享合同是项目稳定性的主线之一 |
| Domain | `b6e0e08` 建立 persona、chat、review、share、source、version，`6b346f2` 增加 persona profile/url 等 | 领域模型从一开始就独立于 API 和页面 |
| Runtime / LLM | `399852b` 选 DeepSeek，`02b9749` live chat 接入 DeepSeek，`5ee9a13` 调 prompt 到 persona-first，`9f83ca7` 引入 MiniMax planner 基础，`0f5e339` 拆成 Fast Planner / Kimi Researcher / DeepSeek Responder | 技术路线从单模型调用走向 planner、retrieval、researcher 和最终 responder 分工 |
| Workflow | `6b346f2` 建立 chat workflow 和 distill workflow，`38bea9c` 加 chat memory 上下文，`9f83ca7` 加 turn router，`0f5e339` 把 research plan、web context、vector retrieval 纳入主链路 | 早期是 workflow-first，后期开始出现检索增强和 agent 化前置结构 |
| Persistence | `b6e0e08` schema 起步，`3c08c32` Postgres repositories，`38bea9c` chat history，`1fc8902` trace schema，`9f83ca7` proactive/realtime 数据，`0f5e339` pgvector/user_memory_facts | 从 demo store 到可追踪、可恢复、可检索、可扩展的数据层 |
| Worker | `6b346f2` distill/source ingest scaffold，`0666160` worker runtime 打通，`9f83ca7` chat proactive job | 重任务逐步从 API 同步请求中剥离 |
| Observability | `6b346f2` worker events/logging，`1fc8902` chat trace collector/viewer，`9f83ca7` trace 与 realtime/planner 链路继续融合，`0f5e339` 记录 planner、research、web context、prompt budget | 后续调 prompt、模型、上下文和联网结果时可追溯 |
| Deployment | `4558663` Docker/Caddy/compose/migrate，`f53d945` 补部署架构文档 | 项目具备本地和云上部署复盘依据 |

## 7. 技术路线变化

### 7.1 从 docs-first 到 contract-first

早期 commit 先锁定产品、架构、LLM provider、后端合同，再进入实现。这个路线让 `packages/contracts` 和 `packages/domain` 成为前后端共同边界，后续 API、页面和 worker 都围绕这些包扩展。

关键 commit：`1b8acee`、`c1f060a`、`399852b`、`9d0e7f6`、`b6e0e08`

### 7.2 从页面 scaffold 到 chat-first H5

前端不是从完整后台或内容站开始，而是先有首页、创建、分享、审核等 scaffold，然后连续多次把 H5 调整为移动端私聊体验。最终首页变成 persona carousel，persona 页变成 messaging thread。

关键 commit：`85bc79f`、`3ea3a6c`、`89c4e3c`、`1d711cc`、`a531fc7`、`ec38a37`、`6da4282`

### 7.3 从模拟/内存态到真实 runtime 和持久化

聊天先有 seeded persona API，再接入 DeepSeek runtime；动态内容从内存 store 迁移到 Postgres；官方 seed 和匿名聊天历史随后也纳入持久化。

关键 commit：`320f3a5`、`02b9749`、`3c08c32`、`09a019e`、`38bea9c`

### 7.4 从 workflow-first 到 planner/agent 基础

技术方案最初明确偏 workflow-first。到 `9f83ca7` 时，项目引入 realtime hub、turn router、MiniMax planner、主动消息 worker，说明聊天架构已经开始准备承载 agent/tool/realtime 方向。到 `0f5e339`，同步 planner 收敛为低延迟 Fast Planner，MiniMax 被定位到异步深度计划，避免拖慢聊天热路径。

关键 commit：`6b346f2`、`38bea9c`、`1fc8902`、`9f83ca7`、`0f5e339`

### 7.5 从黑盒模型回复到可观测聊天

`1fc8902` 把 chat trace collector、trace repository、internal route 和 local viewer 加进来，使一次聊天回复可以被拆解查看。这个能力对后续 prompt 调优、tool 调用和 agent 行为复盘非常关键。

关键 commit：`1fc8902`、`0f5e339`

### 7.6 从大 prompt 到 retrieval-first

`0f5e339` 引入 pgvector、Qwen embedding、chat message embeddings、persona source/profile embeddings 和 `user_memory_facts`。这标志着上下文策略从“每轮尽量塞历史”转为“每轮先做 recent + facts + vector + FTS/exact 检索，再组装可控 Context Pack”。

关键 commit：`0f5e339`

### 7.7 从模型旧知识到 Researcher 查证

`0f5e339` 把 Kimi 定位为最新信息 Researcher，只负责联网查证和输出 `WebContext`，最终用户可见回复仍由 DeepSeek Responder 生成。后端新增 research plan normalizer 和 web context sanitizer，避免把不可靠搜索结果直接当成事实。

关键 commit：`0f5e339`

## 8. Commit 线性明细

| Commit | 功能增量 | 前端 / 页面视角 | 后端视角 | 架构视角 |
| --- | --- | --- | --- | --- |
| `1b8acee` 2026-04-13 | 初始化项目文档和 LLM runtime 设计 | 暂无页面实现 | 暂无运行时代码 | 明确产品、实施计划、技术方案和 LLM runtime 方向 |
| `c1f060a` 2026-04-13 | 对齐架构和实施计划 | 暂无页面实现 | 暂无运行时代码 | 收敛技术方案、README 和实施计划之间的口径 |
| `399852b` 2026-04-13 | 确认 DeepSeek 作为 LLM provider | 暂无页面实现 | 后续聊天 runtime 指向 DeepSeek | 模型供应商决策进入架构文档 |
| `9d0e7f6` 2026-04-13 | 锁定后端 contracts 再实现 | 暂无页面实现 | 明确 API 合同优先 | 为 `contracts` 包和后续接口实现定边界 |
| `6ceb258` 2026-04-13 | 忽略本地 worktree 目录 | 无页面影响 | 无后端影响 | 降低多 worktree 开发时的 git 噪音 |
| `b6e0e08` 2026-04-13 | 初始化 monorepo、API、worker、client、contracts、domain、schema | H5/小程序入口占位 | API server、DB schema、contracts、domain 初版 | 项目从文档进入可运行工程骨架 |
| `320f3a5` 2026-04-13 | 增加官方 persona API 和 seeded chat flows | 首页/聊天可使用官方人物数据 | `personae/featured`、`personae/detail`、`chats`、official seed、chat store | 官方人物和聊天成为第一条产品主链路 |
| `a0c05a9` 2026-04-13 | 增加创建、审核、发布、分享、反馈、auth API | 为创建页、审核页、分享页提供后端能力 | auth、feedback、persona manage、persona versions、reviews、shares、url safety | 创作者闭环和版本级发布/分享模型出现 |
| `6b346f2` 2026-04-13 | 增加 workflow runtime、worker scaffold、DeepSeek client、prompt-kit | 前端暂无显著页面变化 | chat workflow、classification、distill/source ingest worker、rate limit | 从普通 API 走向 workflow-first AI 后端 |
| `85bc79f` 2026-04-13 | scaffold 前端创建、分享、审核、首页、聊天组件 | 新增 home/create/preview/review/share 页面和 chat panel | 通过 api client 对接前面 API | 页面级产品闭环第一次完整出现 |
| `0666160` 2026-04-13 | 打通 worker runtime 和 auth guardrails | 页面可依赖更稳定的 auth/worker 后端 | app 注册、auth session、worker client、review contract、测试 | API 与 worker 边界更清楚，认证防线补齐 |
| `3ea3a6c` 2026-04-13 | 新增本地 H5 产品 shell | 新增本地 H5 壳和测试 | 后端无直接变化 | 支持快速本地查看移动端页面 |
| `c67ba46` 2026-04-13 | 修复 H5 页面以 HTML 方式服务 | H5 页面能被浏览器正确打开 | 后端无直接变化 | 本地 H5 serving 链路修正 |
| `02b9749` 2026-04-13 | live chat 接入 DeepSeek runtime | 聊天页从假数据转向真实模型回复 | chats route、chat workflow、DeepSeek client、runtime-env、prompt tests | LLM runtime 进入主聊天链路 |
| `5ee9a13` 2026-04-14 | 聊天回复转向 persona-first | H5 聊天呈现更强调人物表达 | chat workflow、classification、prompt schema 调整 | 从通用问答转向人格对象表达 |
| `d065aa8` 2026-04-14 | 定义 mobile-first chat 设计系统 | 指导后续 H5 视觉 | 无后端影响 | 设计系统转向移动聊天产品 |
| `89c4e3c` 2026-04-14 | 重设移动 H5 shell | H5 shell、视觉 token、测试更新 | 无后端影响 | 前端视觉 token 开始承载移动端体验 |
| `1d711cc` 2026-04-14 | H5 转向 nocturne chat-first 设计 | H5 页面氛围和聊天优先级调整 | 无后端影响 | 设计系统和 token 继续围绕 chat-first 收敛 |
| `a393631` 2026-04-14 | 收紧文案并聚焦 persona chat | H5 文案减少解释，更集中聊天 | 无后端影响 | 产品表达从说明型转为对话型 |
| `ec5382a` 2026-04-14 | 减少 H5 各页面 shell 文案 | 首页/页面壳更轻 | 无后端影响 | 降低页面噪音，强化核心行为 |
| `5afd921` 2026-04-15 | 强化 chat-first 移动端呈现 | H5 聊天视觉和布局进一步收敛 | 无后端影响 | 移动端体验继续向私聊形态靠拢 |
| `daf805d` 2026-04-15 | 设计系统改写为 private chat 方向 | 指导后续页面私聊化 | 无后端影响 | 设计路线从产品展示转为 private chat system |
| `0cf1b78` 2026-04-15 | 增加 private chat H5 redesign plan | 为 H5 重构提供计划 | 无后端影响 | 记录前端重构目标和实施路径 |
| `8dcf688` 2026-04-15 | 重设 H5 token 以支持 private chat | 视觉 token 为私聊界面服务 | 无后端影响 | token 层配合新的产品视觉方向 |
| `a531fc7` 2026-04-15 | 用 bottom shuttle nav 重建 H5 shell | H5 底部导航成型 | 无后端影响 | 移动端导航结构稳定 |
| `ec38a37` 2026-04-15 | 首页改为 persona carousel launcher | 首页从普通入口变成可滑动人物启动器 | 无后端影响 | 首页职责明确为选择聊天对象 |
| `6da4282` 2026-04-15 | Persona 页改造成 messaging thread | Persona 页变成私聊线程 | 无后端影响 | 核心页面的形态与 chat-first 原则对齐 |
| `4732e56` 2026-04-15 | 辅助 H5 页面统一到 private chat system | create/share/review 等页面风格统一 | 无后端影响 | 页面体系完成一次整体视觉统一 |
| `6efd61f` 2026-04-16 | 增加架构、产品、设计规格文档 | 页面职责在规格文档中明确 | 无后端代码变化 | 产品规格、设计系统、架构蓝图被正式沉淀 |
| `f664fd3` 2026-04-16 | 增加中国手机号登录设计 | 登录页尚未实现 | 为后续 auth 方案提供设计依据 | 登录路线从抽象 auth 走向中国手机号场景 |
| `421cf11` 2026-04-16 | 增加 Supabase/Postgres 迁移设计 | 无直接页面变化 | 为 Postgres 持久化做设计 | 数据层从内存态迁移到 Postgres 的方案先行 |
| `3c08c32` 2026-04-16 | 动态内容持久化到 Postgres | 页面获得可持久的聊天/人物状态基础 | DB client/config/repositories、auth/chats/feedback/reviews/shares 接入持久化 | 项目从内存 demo 进入数据库驱动阶段 |
| `09a019e` 2026-04-17 | 更新 H5 聊天流程和官方 seed 持久化 | 聊天行为、chat panel、H5 app 更新 | official seed 写入持久化，chats route/bootstrap 调整 | 官方人物和聊天流程进入更稳定的数据闭环 |
| `4558663` 2026-04-22 | 改善本地开发、部署和消费者页面 | profile 页、consumer surfaces、create/share/review/home 全面更新 | migrate、DB bootstrap、persona store、API client/contracts 更新 | Docker/Caddy/compose/dev-all 使项目具备部署基础 |
| `f53d945` 2026-04-22 | 增加架构、部署、交互流文档 | 当前交互流和 UI 文案被记录 | 无运行时代码变化 | 架构图、部署架构、前后端同步审计进入 docs |
| `308885e` 2026-04-22 | 合并 task1 bootstrap worktree 到 main | 无独立页面增量 | 无独立后端增量 | 集成节点，主要用于主线同步 |
| `38bea9c` 2026-04-24 | 发布匿名聊天历史 flow | chat panel/H5 可承接非登录聊天历史 | `/me`、chat repository、chat memory、schema、persona manage/version contracts 更新 | 登录前体验从一次性聊天转为可延续历史 |
| `1fc8902` 2026-04-24 | 增加 chat trace 可观测性和本地 viewer | 新增 `tools/chat-trace-viewer` | trace collector/config/repository/internal route/schema，DeepSeek client 支持 trace | 聊天链路可观测，便于调试 prompt、上下文和模型调用 |
| `9f83ca7` 2026-04-25 | 增加 realtime chat planner foundation | chat panel 承接 realtime/proactive 基础 | realtime route/hub/presence/PG listener、MiniMax planner、turn router、chat proactive worker | 聊天架构开始准备 realtime、主动消息、planner/tool 化 |
| `0f5e339` 2026-04-27 | 增加 retrieval planner researcher pipeline | chat panel 把发送成功和 AI 正在输入拆开，避免 loading 含义错位 | pgvector schema、Qwen embedding、chat/persona retrieval repository、user memory facts、Fast Planner、Kimi Researcher、research plan sanitizer、runtime 时间注入 | 聊天主链路形成 retrieval-first + low-latency planner + researcher + DeepSeek responder 的分层 |

## 9. 2026-05-07 分支开发过程记录

本节记录 `codex/nuwa-distill-profile-v2` 分支的提交前开发过程。该分支把“一键蒸馏”从同步创建表单扩展为可观测、可轮询、可管理的对象创建流程，同时补齐“我的对象”作为蒸馏后对象的归宿。

### 9.1 本次解决的问题

- 创建流程原先缺少稳定的用户对象归宿，蒸馏完成后只能进入预览或聊天，用户难以从“我的”中继续管理对象。
- 资料发现和蒸馏任务原先容易落到同步接口等待，用户请求会被 Kimi 搜索、模型抽取或 worker 执行阻塞。
- 蒸馏过程缺少端到端日志，排查“为什么对象还在创建中”“为什么回复像模板”时只能从局部接口猜测。
- DeepSeek V4 结构化 JSON 回复存在 thinking 兼容风险，空内容或非 JSON 内容会让聊天链路表现为重复、模板化或 fallback。
- Kimi 聊天搜索原 8 秒超时对异步消息体验偏短，容易出现 planner 决定搜索但搜索结果来不及进入上下文。

### 9.2 主要改动范围

- 产品与前端：补齐“我的对象”列表、对象详情、对象聊天入口、删除和补资料等用户侧管理路径；创建完成后回到用户能理解的对象归属，而不是展示内部蒸馏细节。
- 后端接口：增加一键蒸馏 V2 的 intent、source discovery job、distill job、my objects、对象聊天等接口；资料发现接口改为创建后台 job 后立即返回，前端通过轮询读取状态。
- 数据库：新增 `persona_distill_*`、`owned_persona_objects`、distill artifacts/tool runs 等表和索引，支撑 source discovery、distill job、对象库存和可观测日志。
- Worker：新增 source discovery polling job 和 distill polling job，把 Kimi 搜索、资料清洗、证据抽取、profile 生成和版本持久化放入后台执行。
- 模型与工具底座：蒸馏流程按 tool function 封装，业务语言负责调度和状态落库；模型负责风险判断、资料抽取、证据组织、profile 合成等更适合模型的步骤。
- Chat 链路：DeepSeek 结构化 JSON 请求支持 `thinking` 配置，V4 默认关闭 thinking；Kimi 聊天搜索默认超时提高到 30 秒，并在 trace 中记录 search/timeout 结果。
- 可观测性：蒸馏 job 每一步写入 artifacts/tool runs，输入、输出、工具调用、错误信息和状态流转可以从日志和内部接口复盘。
- 文档：补充 Nuwa skill 分析、一键蒸馏 V2 方案、产品缺口、前后端接口流、后端蒸馏架构、异步 source discovery 与同步阻塞排查计划。

### 9.3 验证记录

- `pnpm -r typecheck`：通过。
- `pnpm -r --if-present test`：首次按默认并发运行时，API 用例与本地 dev API/worker/H5 服务共同占用 Supabase session pool，出现 `EMAXCONNSESSION` 连接池耗尽并挂在 API 长尾用例；该 run 已中断，不作为代码逻辑失败结论。
- `node --import tsx --test --test-concurrency=1 "src/**/*.test.ts"`（`apps/api`）：通过，109 个 API 用例全部通过；该命令用于规避 Supabase pooler 并发限制。
- `pnpm --filter @hall-of-fame/client test`：通过，35 个前端 H5 行为用例全部通过。
- `pnpm --filter @hall-of-fame/contracts test`：通过，11 个合同用例全部通过。
- `pnpm --filter @hall-of-fame/domain test`：通过，5 个领域用例全部通过。
- `pnpm --filter @hall-of-fame/prompt-kit test`：通过，10 个 prompt 用例全部通过。
- `pnpm --filter @hall-of-fame/kimi-client test`：通过，3 个 Kimi client 用例全部通过。
- `pnpm --filter @hall-of-fame/runtime-env test`：通过，当前 0 个测试。
- `pnpm --filter @hall-of-fame/ui-tokens test`：通过，2 个 UI token 用例全部通过。
- `@hall-of-fame/worker`、`@hall-of-fame/api-client`、`@hall-of-fame/deepseek-client` 当前没有可执行 test 脚本输出；其类型检查已由 `pnpm -r typecheck` 覆盖。

### 9.4 已知风险和后续决策

- Planner 是否搜索仍应由模型判断，而不是继续叠加规则；当前 prompt 对“歌词、原话、台词、具体引用”等应触发搜索的场景提示不足，需要下一步改 planner prompt 和测试。
- API 全量测试默认并发与当前 Supabase session pool 不匹配，后续需要为 API 测试加串行脚本或本地测试库，避免每次全量验证被环境连接数干扰。
- 真实 Kimi web search 仍依赖供应商可用性；source discovery 已异步化，但前端需要把失败、重试、等待状态表达得足够简单。
- 产品 UI 必须继续遵守“只给用户看有用信息”的 rule，蒸馏证据、tool logs、内部评分默认只用于调试和管理，不进入普通用户聊天界面。

## 10. 2026-05-09 分支开发过程记录

本节记录 `codex/planner-autonomous-tool-use` 分支的提交前开发过程。该分支把聊天 planner 从“模型先判断、本地关键词规则再兜底覆盖”收敛为“模型自主判断是否使用工具”，并补齐工具计划 trace，方便后续排查 search、memory、persona knowledge 是否按预期进入链路。

### 10.1 本次解决的问题

- 旧链路里 `applyHardGuardOverrides` 会在 planner 成功后根据“今天、刚才、记得”等关键词覆盖模型决策，导致 web search、chat memory、persona knowledge 并不完全由 planner 自主判断。
- 旧 fast planner prompt 带有明显关键词规则路由倾向，容易让模型看到单个词就机械选工具，而不是判断当前消息是否真的依赖外部上下文。
- 旧 trace 更偏记录 planner 结果本身，缺少“请求了哪些工具、实际尝试了哪些工具、哪些结果最终进入回复上下文”的分层信息，排查 search 没走或 memory 没用时不够直接。
- fallback 与成功路径边界不够清楚，后续看日志时容易把 planner disabled、parse failed、timeout 与模型正常决策混在一起。

### 10.2 主要改动范围

- Planner 成功路径：移除正常链路里的 `applyHardGuardOverrides`，planner 返回的 plan 只做 schema finalization；只有 disabled、not configured、timeout、parse failed、unknown failed 等异常路径才进入 fallback。
- Planner prompt：把 fast planner system prompt 改成“上下文依赖判断”，明确它不是关键词规则路由器，并要求不要因为单个词机械选择工具。
- Planner trace：为成功、关闭、失败、fallback 分别记录 `plannerStatus`、`fallbackUsed`、`decisionFinalizedBy`，让一次 turn 的决策来源可追溯。
- Chat route trace：新增 `chat.tool_plan.finalized` 与 `chat.tools.execution.completed`，区分 requested tools、attempted tools、result-used tools，并记录 web search 是否请求、是否尝试、是否真正使用结果。
- 工具计划 helper：新增 `tool-plan-trace.ts`，统一从 turn plan 和执行结果生成工具 trace 字段，避免 `routes/chats.ts` 继续堆散落字段。
- 测试：补齐 planner service、fast planner prompt、tool trace helper、chat route trace 的回归测试，覆盖“包含今天/刚才/记得但模型选择不用工具时不得被本地规则覆盖”和“模型选择 web search 但 Kimi 关闭时 trace 要能看出请求与未使用结果”。
- 文档：新增 planner 自主工具判断计划文档，并按阶段让 subagent 做计划和实现 review。

### 10.3 验证记录

- `cd apps/api && node --import tsx --test src/services/minimax-planner/tool-plan-trace.test.ts`：通过，3 个 helper 用例全部通过。
- `pnpm --filter @hall-of-fame/api typecheck`：通过。
- `cd apps/api && node --import tsx --test src/services/minimax-planner/fast-planner-client.test.ts src/chat-trace.test.ts`：通过，14 个用例全部通过。
- `cd apps/api && node --import tsx --test src/services/minimax-planner/chat-planner.test.ts src/services/minimax-planner/fast-planner-client.test.ts src/services/minimax-planner/tool-plan-trace.test.ts src/chat-trace.test.ts`：通过，26 个目标用例全部通过。
- `pnpm typecheck`：通过，workspace 类型检查全部通过。
- `rg -n "applyHardGuardOverrides|hardGuardApplied|Hard guard|规则：问|今天.*ws\\s*=\\s*true|今天.*needWebSearch.*必须" apps/api/src docs`：生产代码无残留；命中仅为计划文档历史说明和负向测试断言。
- `pnpm --filter @hall-of-fame/api test`：默认并发运行耗时约 5.5 分钟，117 个 API 用例中 115 个通过、2 个失败；输出被长日志截断，未作为本次 planner 逻辑失败结论。该项目此前已记录默认并发与 Supabase session pool 容易相互影响。
- `cd apps/api && node --import tsx --test --test-concurrency=1 "src/**/*.test.ts"`：通过，117 个 API 用例全部通过，用时约 12.7 分钟；用于确认默认并发失败来自测试并发/连接池环境，而不是本次 planner 改动。

### 10.4 已知风险和后续决策

- Planner 现在真正拥有工具选择权，真实效果依赖模型对上下文依赖的判断质量；上线后需要持续用 chat trace 观察漏搜和误搜。
- fallback 仍然保留规则判断，但只在 planner 不可用或失败时使用；这保证产品可用性，同时避免正常路径被本地 hard guard 抢走决策权。
- 当前测试验证的是后端行为和 prompt 约束，不伪装成模型质量评测；后续需要用真实聊天样本建立 planner 回放集。
- API 全量测试默认并发仍可能受 Supabase session pool 限制影响，后续应补稳定的串行 test script 或本地测试库，避免每次提交前靠临时命令绕开。
- Proactive 仍保留 route 侧显式请求二次保护，避免 planner 偶发误判直接创建主动消息任务。

## 11. 下一阶段观察点

当前主线已经纳入 retrieval / planner / researcher 基础，后续建议重点观察这些方向：

| 方向 | 涉及文件 | 可能含义 |
| --- | --- | --- |
| Kimi 搜索可信度 | `services/research/web-context-sanitizer.ts`、`services/kimi/kimi-researcher.ts` | 需要继续加强 freshness validator，不能只相信模型自报 `fresh` |
| 用户记忆治理 | `user_memory_facts`、后续前端管理入口 | V1 已有后端抽取和读取，V1.1 需要补用户可见删除/纠错能力 |
| Embedding 运维 | `services/embeddings/*`、Supabase pgvector | 需要关注向量写入成本、失败重试、embedding model 迁移和索引策略 |
| Planner 延迟 | `fast-planner-client`、MiniMax async planner 文档 | 同步链路继续保持 low-latency；MiniMax 只适合异步深度计划 |
| 一键蒸馏对象归宿 | `routes/my-objects`、`persona_distill_jobs`、`owned_persona_objects` | 蒸馏成功后对象必须回到“我的对象”，并支持聊天、补资料、删除、编辑 |
| 异步任务体验 | `persona_distill_source_discovery_jobs`、worker polling、H5 create flow | 长任务只返回 job，前端轮询状态；同步接口只保留极快操作 |
| 蒸馏日志可观测性 | `persona_distill_artifacts`、`persona_distill_tool_runs` | 每一步输入输出要可查，但不能暴露给普通用户 UI |
| Planner 搜索判断 | `services/minimax-planner/chat-planner.ts`、chat trace | 搜索是否发生应由模型决策，下一步要补 prompt 和测试覆盖引用/歌词/最新事实场景 |

## 12. 自检结论

这版结构相对原方案做了两个关键调整：

- 线性 commit 明细被保留，但不再承担全部解释任务；功能回溯可以先查第 4 节，再跳到第 8 节看具体 commit。
- 技术路线单独成节，能直接复盘从 docs-first、contract-first、workflow-first 到 realtime/planner/agent 基础的变化。

按这个结构，后续新增功能时至少维护三处：阶段路线是否出现新阶段、功能索引是否新增或扩展能力、commit 明细是否记录本次提交。必要时同步更新页面级演进、后端能力演进和技术路线变化，确保项目总览、按功能回溯、按 commit 审计三种读法都能成立。

## 13. 2026-06-04 分支开发过程记录

本节记录 `codex/anysearch-researcher` 分支的提交前开发过程。该分支把在线搜索从 Kimi 模型内置 `$web_search` 工具完全替换为 AnySearch 原生搜索 API，解决 Kimi 上游 overloaded 导致搜索不可用的问题。

### 13.1 本次解决的问题

- Kimi 内置 `$web_search` 工具依赖 Moonshot 上游可用性，一旦引擎 overloaded 或工具调用异常，整个 researcher 链路会直接失败，用户收到 "Kimi request failed" 或 "Kimi exceeded max tool calls" 错误。
- Kimi 搜索需要多轮 tool-call loop（system prompt → user prompt → model tool call → tool result → model final JSON），链路长、延迟高、失败点多。
- 模型生成的 JSON 需要额外解析、清理、验证，存在 parse error 和格式漂移风险。

### 13.2 主要改动范围

- **`packages/kimi-client/src/kimi-researcher.ts`**：完全重写。移除 Kimi chat completions 调用、tool-call loop、JSON parse 和 normalize 逻辑；改为直接 POST `https://api.anysearch.com/v1/search`，将返回的 `results` 映射为 `WebContext`。保留 `runKimiResearcher` 函数签名和 `WebContext` 类型，避免改动所有调用方。
- **`packages/kimi-client/src/kimi-researcher.test.ts`**：重写测试。mock AnySearch API 响应，覆盖正常返回、空结果、research plan query 优先、AnySearch 业务错误、HTTP 错误 5 个场景。
- **`.env.example.hall-of-fame`**：新增 `ANYSEARCH_API_KEY=`；保留原有 Kimi 配置但标注 deprecated，因为 Kimi 可能仍用于其他非搜索场景（如 fast planner provider）。
- **`scripts/check-kimi-web-search.ts`**：重写为 AnySearch 诊断脚本，直接调用 AnySearch API 并打印结果列表。
- **`apps/api/src/db/client.ts`**：为 Supabase / pooler 连接显式开启 `ssl: "require"`，避免环境切换时因为 SSL 协商缺失导致数据库连接不稳定。
- **`anysearch-docs.png`**：保留本地 AnySearch 文档截图，作为这次替换搜索供应商时的实现参考材料。

### 13.3 验证记录

- `cd packages/kimi-client && node --import tsx --test src/kimi-researcher.test.ts`：通过，5 个用例全部通过。
- `pnpm --filter @hall-of-fame/kimi-client test`：通过，5 个用例全部通过。
- `pnpm --filter @hall-of-fame/api typecheck`：通过，确认 `db/client.ts` 的 Supabase SSL 连接调整没有引入类型回归。
- `pnpm typecheck`：通过，workspace 类型检查全部通过。

### 13.4 已知风险和后续决策

- AnySearch 免费匿名模式有 IP 级 rate limit 和每日配额；生产环境必须配置 `ANYSEARCH_API_KEY` 并监控配额。
- AnySearch 返回的 `content` 字段可能较长，作为 `keyFindings` 直接使用时需要注意 prompt 上下文长度；后续如需更精简的 findings，可考虑在 AnySearch 结果基础上加一层轻量 LLM 摘要。
- 当前实现只取 `researchPlan.searchQueries[0]` 作为查询词，与旧 Kimi 行为一致；如需多 query 并行搜索，后续可扩展为并发调用 AnySearch 再合并结果。
- `publishedAt` 字段目前固定为 `null`，因为 AnySearch 文档未明确返回发布时间；后续如 API 支持，可直接映射。
