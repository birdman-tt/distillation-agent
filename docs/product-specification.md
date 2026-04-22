# Hall of Fame Product Specification

- Version: 1.0
- Date: 2026-04-16
- Status: Active product specification for current implementation and near-term iteration
- Related docs:
  - [产品概念稿](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/product-design.md)
  - [技术方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/technical-architecture.md)
  - [实施计划](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/implementation-plan.md)
  - [设计系统方向稿](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/DESIGN.md)

## 1. 文档目的

这份文档不是概念讨论稿，而是产品规格文档。

它回答 5 个问题：

1. 这个产品到底解决什么问题
2. 当前版本到底做哪些功能，不做哪些功能
3. 各页面分别承担什么职责
4. 关键交互和状态应该如何表现
5. 后续设计、前端、后端在落地时应该以什么为准

这份文档优先参考通用 PRD/产品规格结构：

- 先定义目标、用户、范围和成功标准
- 再定义功能模块、页面、交互、状态和边界
- 最后补充依赖、指标和非功能约束

## 2. 产品定义

Hall of Fame 是一个公开人格蒸馏平台。

用户可以：

- 进入官方人物馆
- 和一个被蒸馏后的人格对象对话
- 基于公开资料创建自己的对象
- 让对象进入预览、审核、发布和分享链路
- 把“对象本身”分享给别人继续使用

这个产品不是：

- 私密分身产品
- 熟人或恋人模拟器
- 数字复活产品
- 严肃事实问答系统
- 高风险建议工具

这个产品的核心资产是：

- `可对话的人格对象`
- `对象的版本`
- `对象背后的公开资料`
- `对象的分享身份`

不是单次聊天记录。

## 3. 目标用户

## 3.1 主用户群

### 普通体验用户

特征：

- 被官方人物吸引进入
- 希望快速体验“和某个人格聊天”
- 不愿意先读长说明或做复杂配置

主要需求：

- 快速进入聊天
- 感到“这个人格有味道”
- 愿意继续切换不同人物尝试
- 愿意把好玩的对象发给别人

### 轻创作者用户

特征：

- 愿意整理公开资料
- 想做一个“像某人”的对象
- 对创建、预览、发布和分享有持续兴趣

主要需求：

- 创建门槛低
- 资料来源清楚
- 预览结果能快速判断“像不像”
- 分享后的体验不失真

## 3.2 非目标用户

- 专业研究用户
- 高风险决策咨询用户
- 需要严肃事实保证的知识问答用户
- 以亲密陪伴、关系模拟为主的用户

## 4. 产品目标

## 4.1 当前版本目标

当前版本优先验证以下闭环：

1. 用户进入首页并被某个人格吸引
2. 用户进入 persona 页并开始对话
3. 用户理解“我也可以创建”
4. 用户提交公开资料并生成一个对象
5. 用户预览对象并提交审核/发布
6. 用户分享对象，别人继续聊

## 4.2 成功标准

从产品角度，当前版本的核心成功标准是：

- 用户首屏能立即理解“这是聊天产品，不是工具台”
- persona 页首屏能立即进入聊天状态
- 创建流程能在低认知负担下完成
- 分享页能直接承接“继续聊”
- 回答整体上呈现人格感，而不是解释系统在如何工作

## 5. 产品原则

## 5.1 Chat First

所有核心页面都服务于“进入对话”。

如果一个页面让用户先读说明、再找入口，这个页面就是失败的。

## 5.2 Persona First

资料的作用是塑造人格边界和表达方式，而不是把产品变成检索问答器。

## 5.3 Share the Persona, Not the Transcript

分享的是对象版本，而不是单条回答或聊天截图。

## 5.4 Public Material Only

所有创建链路只允许使用公开资料或明确有权使用的资料。

## 5.5 Mobile First

默认按移动端体验做决策，尤其是首屏信息密度、按钮位置和导航位置。

## 6. 范围定义

## 6.1 当前版本必须包含

- 首页 / 官方人物入口
- persona 对话页
- 分享页
- 创建页
- 预览页
- 审核页
- 官方人物馆
- 用户创建对象
- 资料录入
- 资料审核
- 蒸馏预览
- 版本发布审核
- 版本级分享
- 用户反馈

## 6.2 当前版本明确不做

- 关系型陪伴场景
- 活人名人蒸馏
- 私密聊天记录导入
- 语音 / 视频 / 数字人形象复刻
- 开放式 UGC 广场
- 投资、医疗、法律等高风险可执行建议

## 7. 功能规格

## 7.1 首页 / Hall

### 目标

让用户快速选中一个“现在就想聊的人格对象”。

### 核心能力

- 展示一组 persona carousel 项
- 当前项包含：
  - 人物名
  - 一句话钩子
  - 人物形象或情绪图层
- 点击当前项直接进入 persona 聊天页
- 底部可滑动导航提供少量高频入口

### 首页必须做到

- 首屏只有一个强中心
- 不出现大段产品说明
- 当前卡片一眼能判断“为什么点进去聊”

## 7.2 Persona 页

### 目标

让用户像进入私聊窗口一样立即开始对话。

### 核心能力

- 极简 header：
  - 人物名
  - 极短状态句
- 消息流
- persona 默认先发一句话
- 用户输入框固定在底部
- 支持继续发送消息
- 支持查看“这句话怎么来的”的弱披露层

### Persona 页必须做到

- 不展示推荐问题
- 不展示大段 persona 介绍
- 不把系统解释词暴露在默认界面上
- 首屏视觉中心只能是消息流

## 7.3 分享页

### 目标

让被分享者以最低摩擦进入同样的聊天体验。

### 核心能力

- 解析 `share_slug`
- 展示对应 persona/version 的聊天入口
- 沿用 persona 页的聊天语言
- 承接到继续聊天

### 分享页必须做到

- 不先做“对象说明书”
- 不把 provenance/技术状态放在首屏中心
- 首屏必须能直接进入聊天

## 7.4 创建页

### 目标

让用户用最少的步骤创建一个人格对象。

### 核心能力

- 输入对象名称
- 选择对象类型
- 选择蒸馏重点
- 提交文本资料或 URL 资料
- 触发蒸馏

### 创建页必须做到

- 语气像“塑造一个可以聊天的人格”
- 不像后台表单
- 不要求用户先理解完整系统原理

## 7.5 预览页

### 目标

让创建者在发布前判断对象是否“活了”。

### 核心能力

- 展示版本预览 intro
- 展示示例回答 / 预览结果
- 展示发布前状态
- 允许提交发布审核

### 预览页必须做到

- 先给人格感，再给管理动作
- 用户能快速判断“像不像”

## 7.6 审核页

### 目标

让 reviewer 快速完成资料审核和版本发布审核。

### 核心能力

- 查看待审资料
- approve/reject source
- 查看待发版本
- approve/reject publish
- 保留原因说明

### 审核页必须做到

- 功能明确
- 不污染主产品的情绪语言
- 但仍保留统一的视觉系统，不做完全不同的后台皮肤

## 8. 关键交互规范

## 8.1 首页交互

- carousel 默认手动滑动，不自动轮播
- 点击当前卡直接进入 persona 页
- 邻近卡片只露边，暗示可滑动
- 底部导航优先用于跨页面穿梭，不承担首屏解释任务

## 8.2 Persona 页交互

- 首次进入即看到 persona 先发的一句消息
- 输入框固定于底部，成为唯一主操作
- 发送后消息插入消息流末尾
- 对回答解释层默认折叠，仅在用户主动查看时展开
- 高风险问题仍保持 persona 口吻，但只给原则提醒

## 8.3 创建流交互

- 先完成最少必要信息，再看更细状态
- URL 资料和文本资料属于平级入口
- 审核和发布是后续状态，不应在首次创建时压到用户面前

## 8.4 分享交互

- 分享链接命中 `persona_version`
- 分享进入后直接承接聊天
- 不让旧分享因为后续编辑而漂移

## 9. 页面清单

| 页面 | 路径 | 主要职责 |
| --- | --- | --- |
| 首页 | `/` | 选择想聊的 persona |
| Persona 页 | `/persona/:personaId` | 进入真实聊天 |
| 分享页 | `/share/:shareSlug` | 承接分享入口并继续聊天 |
| 创建页 | `/create` | 创建 persona 与提交资料 |
| 预览页 | `/preview/:personaVersionId` | 预览候选版本并提交发布审核 |
| 审核页 | `/review` | reviewer 完成资料和发布审核 |

## 10. 状态与权限

## 10.1 用户角色

- `ANONYMOUS`
- `USER`
- `REVIEWER`

## 10.2 Persona 状态

- `DRAFT`
- `PROCESSING`
- `READY`
- `PUBLISHED`
- `REJECTED`

## 10.3 Persona Version 状态

- `DRAFT`
- `CANDIDATE`
- `PENDING_PUBLISH_REVIEW`
- `PUBLISHED`
- `SUPERSEDED`
- `REJECTED`

## 10.4 权限规则

- 匿名用户可浏览和体验公开 persona
- 创建、预览、发布提交需要登录
- draft preview 仅 owner 或 reviewer 可访问
- source review 和 publish review 仅 reviewer 可访问
- share chat 对外指向 published version

## 10.5 页面状态基线

每个核心页面都至少需要定义以下状态：

### 首页

- loading
- loaded
- empty featured fallback
- request error

### Persona 页

- initial greeting ready
- sending
- assistant replying
- reply failed
- chat unavailable

### 分享页

- share resolved
- share not found
- share inactive

### 创建页

- idle
- validating
- submitting
- submitted
- submit failed

### 预览页

- candidate ready
- still processing
- publish submitted
- publish rejected

### 审核页

- pending list loaded
- no pending items
- action in progress
- action failed

## 11. 内容与安全边界

## 11.1 内容来源边界

- 仅允许公开资料或用户有权使用的资料
- URL 资料需要审核后才能进入正式蒸馏
- 活人名人和高敏感对象不纳入当前版本范围

## 11.2 回答边界

- 开放式、观点式、策略式问题允许自然回答
- 缺少直接资料时可以继续保持人格感，但不能编造新事实、具体经历、具体原话
- 事实性、经历性追问在无覆盖时只能收缩到抽象态度和判断框架
- 高风险问题必须收缩到原则提醒，不给可执行建议

## 11.3 默认展示边界

默认界面不展示这些系统词：

- grounded
- inferred
- insufficient_evidence
- refusalReason
- basisSummary

## 12. 非功能要求

- 移动端优先
- 默认围绕 390px 视口做主设计
- 首屏信息密度低
- 主操作位于拇指热区
- 分享版本稳定，不漂移
- 后端统一 API 面，平台差异只落在 adapter / 登录层

## 13. 成功指标

当前版本建议跟踪：

- 首页到 persona 页点击率
- persona 页首条消息发送率
- 首次会话完成率
- 创建流程完成率
- 资料审核通过率
- 候选版本到发布提交转化率
- 分享创建率
- 分享页到继续聊天转化率
- 负反馈率：
  - 不像这个人
  - 没有依据
  - 高风险误导

## 14. 依赖与协作边界

产品文档负责定义：

- 目标用户
- 范围
- 页面职责
- 交互规则
- 内容和安全边界

不负责定义：

- 具体 API 细节
- 具体数据库字段
- 具体 token 值

这些分别由：

- 技术方案
- 架构蓝图
- 设计系统规范

承担。

## 15. 参考规范

这份文档的结构参考了通用产品规格文档习惯：

- 先定义目标、用户、范围与成功标准
- 再定义功能模块与页面职责
- 再定义交互、状态、约束和指标

外部参考包括：

- Atlassian 的 Product Requirements Blueprint 思路：目标、需求、体验、成功指标分层
- 当前项目已定的产品概念稿与实施计划

这份文档现在应被视为当前项目的产品规格基线。
