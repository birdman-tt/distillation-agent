# Hall of Fame Design System Specification

- Version: 1.0
- Date: 2026-04-16
- Status: Active design-system specification
- Related docs:
  - [设计方向稿](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/DESIGN.md)
  - [产品规格](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/product-specification.md)
  - [当前 UI tokens](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/packages/ui-tokens/src/index.ts)

## 1. 文档目的

这份文档定义 Hall of Fame 的设计系统规范。

它回答 6 个问题：

1. 这个设计系统面向谁
2. 界面的核心感受应该是什么
3. token 应该如何分层
4. 组件和页面应该遵守什么规则
5. 文案、动效、可访问性应遵守什么边界
6. 设计和代码之间如何保持一致

这份文档不是 moodboard，也不是单次重构记录。
它是设计系统的维护规范。

## 2. 设计系统面向的人群

## 2.1 主要使用者

### 终端用户

终端用户分为两类：

- 想直接进入聊天的普通体验用户
- 想创建和发布 persona 的轻创作者

他们共同的特点是：

- 主要在手机上使用
- 不想先读大量说明
- 会凭第一屏的情绪决定是否继续
- 对“有没有人格感”比对“功能有没有列全”更敏感

### 内部使用者

- 设计师
- 前端工程师
- 产品经理
- reviewer/运营支持人员

这套系统必须同时支持：

- 用户端的沉浸感
- 内部迭代的可维护性

## 2.2 非目标审美

这套设计系统不面向这些方向：

- 企业后台
- SaaS dashboard
- 卡片信息流平台
- 明亮社交工具
- 过度文学化编辑器

## 3. 设计目标

## 3.1 核心体验目标

用户进入产品时，应该立刻感到：

- 这是一个正在发生的聊天
- 我是在靠近一个人格，而不是在使用一个 AI 工具
- 页面是私密的、夜间的、略带暧昧感的
- 界面没有在用系统说明打断我

## 3.2 核心设计目标

- `mobile-first`
- `chat-first`
- `persona-first`
- `private-night atmosphere`
- `one strong center per screen`

## 4. 设计原则

## 4.1 Chat Window First

默认界面先是聊天窗口，后才是页面。

## 4.2 Private, Not Decorative

私密感来自层级、配色和节奏，不来自花哨装饰。

## 4.3 Action Color Must Work

主题色只服务关键互动：

- 用户气泡
- 发送按钮
- 选中态
- 当前导航项

主题色不是拿来刷满整页背景的。

## 4.4 Hidden Machinery

系统推理、判断枚举和内部策略不在默认 UI 中暴露。

## 4.5 Thumb-Reach Priority

主要动作和导航默认放在手机拇指热区。

## 4.6 One Strong Thing Per Screen

每一屏只允许一个明显的视觉中心。

## 5. Token 架构

这部分采用设计系统常见的三层结构：

- `primitive tokens`
- `semantic tokens`
- `component tokens`

理由：

- primitive 负责底层值
- semantic 负责角色语义
- component 负责具体组件上的应用

## 5.1 Primitive Tokens

primitive tokens 定义设计系统的基础值，不直接表达用途。

必须包含：

- color scales
- spacing scale
- typography scale
- radius scale
- shadow scale
- motion timing

示例分类：

- `neutral/*`
- `rose/*`
- `success/*`
- `warning/*`
- `danger/*`
- `space/*`
- `radius/*`
- `font/*`
- `motion/*`

## 5.2 Semantic Tokens

semantic tokens 表达“这个 token 做什么”，而不是“它是什么颜色”。

当前系统建议按以下语义角色组织：

- `canvas`
- `chrome`
- `assistant-surface`
- `neutral-surface`
- `user-bubble`
- `action`
- `action-pressed`
- `action-wash`
- `ink`
- `ink-muted`
- `ink-soft`
- `border`
- `border-strong`
- `success`
- `warning`
- `danger`
- `focus-ring`

要求：

- 语义 token 必须是 UI 层真正消费的主要入口
- 不允许业务代码直接依赖 primitive color 名称

## 5.3 Component Tokens

component token 表达 token 在具体组件中的应用。

示例：

- `chat/user-bubble/background`
- `chat/assistant-bubble/background`
- `chat/send-button/background`
- `nav/shuttle/background`
- `nav/shuttle/item-active`
- `card/carousel/title`
- `input/composer/background`

当前项目体量不要求一开始把所有 component token 颗粒化到底，但至少需要为高复用、高品牌识别组件保留这层概念。

## 6. Color System

## 6.1 颜色职责

当前系统不采用“一整页一个主色”的方案，而采用三层职责：

### 背景层

负责承接长时间对话，保持稳定和低刺激。

### 表面层

负责把 header、assistant bubble、secondary panel 从背景里抬起来。

### 动作色层

负责：

- 用户气泡
- 发送按钮
- 选中态
- 当前导航项

## 6.2 当前角色配色

当前实现 token 基线：

- Canvas: `#0f1115`
- Chrome: `#14171d`
- Assistant surface: `#1b1f27`
- Neutral surface: `#232833`
- Primary ink: `#f6efe7`
- Secondary ink: `#cabfb6`
- Quiet ink: `#8c909d`
- Border: `#2a303a`
- Border strong: `#3a414d`
- User bubble: `#8f6376`
- Action: `#d88aa4`
- Action pressed: `#b46f88`
- Action wash: `#2f222a`

## 6.3 用色规则

- assistant bubble 永远不吃主题色
- user bubble 吃柔和主题色
- send button 使用同色系里最明确的动作色
- 不能同时出现多组竞争性的饱和强调色
- 默认不要使用高亮社交蓝作为品牌色
- focus ring 可以是辅助蓝，但只能用于无障碍焦点

## 7. Typography

## 7.1 字体角色

- Display：serif，用于情绪锚点
- Body：sans，用于消息、表单、标签和控制
- Mono：仅用于 share slug 或技术短串

## 7.2 字体层级

- Hero title: 32-40px
- Page title: 24-30px
- Card title: 20-24px
- Body: 15-16px
- Bubble text: 16px
- Meta: 13-14px

## 7.3 排版规则

- Serif 不用于大量系统标签
- Body 文本优先可读性，不追求装饰感
- 消息气泡内文字必须是系统里最稳定的阅读层
- 元信息要弱，但不能模糊到看不清

## 8. Layout and Spacing

## 8.1 视口优先级

优先级：

1. 390px 手机视口
2. 窄桌面
3. 宽桌面

## 8.2 布局规则

- 默认单列
- 主要内容宽度优先围绕聊天阅读区
- 不默认使用双栏或 dashboard 布局
- 页面顶部不堆说明卡

## 8.3 间距规则

采用 8px 基础系统：

- 8px 微间距
- 12px 控件间距
- 16px 常规内容间距
- 24px 区块间距
- 32px 页面主区块分隔
- 48px 大段落间隔

## 9. Radius, Shadow, Border

## 9.1 Radius

当前系统的圆角必须服务于“私聊容器感”，不是平台工具感。

建议：

- pill: 导航、状态条、chips
- medium: 面板和输入容器
- large: 大卡片、主容器
- bubble: 聊天气泡专用

## 9.2 Shadow

阴影只做层级，不做发光表演。

必须区分：

- panel shadow
- card shadow
- low-intensity accent glow

## 9.3 Border

边框永远是辅助层，不允许依靠边框来承担全部层级关系。

## 10. Motion

## 10.1 动效原则

- 轻
- 慢半拍
- 不抢聊天阅读节奏

## 10.2 允许的动效

- 页面轻微淡入
- bubble 出现的小幅位移
- carousel 柔和滑动
- disclosure 温和展开

## 10.3 禁止的动效

- 夸张弹簧
- 大尺度缩放
- 炫技 loading
- 高频闪烁

## 11. 核心组件规范

## 11.1 Bottom Shuttle Navigation

规则：

- 固定在底部
- 可横向滑动
- 当前项高亮
- 整体像一个轨道容器，而不是散落的 tab pills

## 11.2 Persona Carousel Card

首页主卡必须同时承载：

- 人物名
- 一句话钩子
- 人物情绪图层 / 轻形象层

它是情绪入口，不是 SKU 卡。

## 11.3 Chat Header

persona 页顶部栏只保留：

- persona name
- 短状态句

不允许：

- 长摘要
- metadata chips
- 多余说明

## 11.4 Assistant Bubble

规则：

- 使用中性深色表面
- 比背景抬一层
- 不带品牌主题色
- 阅读上要稳定和克制

## 11.5 User Bubble

规则：

- 使用柔和主题色
- 与 send button 保持同一家族
- 比 send button 更柔和

## 11.6 Composer

规则：

- 固定在底部
- 暗色 field
- 明确 send button
- 成为页面唯一主操作

## 11.7 Reply Inspector

这句话怎么来的：

- 默认折叠
- 用人话解释
- 不暴露内部枚举和模型术语

## 11.8 Form Surfaces

创建、预览、审核页中的表单控件必须继承同一套 dark-chat 语言，不允许退回通用后台表单观感。

## 12. 页面模式

## 12.1 首页

首页是 conversation launcher。

必须：

- 一句 slogan
- 一张主 persona 卡
- 左右露边提示可滑动
- 点卡直接进 chat

不能：

- 首屏堆产品说明
- 首屏堆功能入口
- 首屏变成卡片信息流

## 12.2 Persona 页

persona 页必须像 DM 窗口。

必须：

- header 极简
- 消息流占中心
- persona 先开口
- composer 固定底部

不能：

- 推荐问题 rail
- 长摘要
- 系统说明块

## 12.3 分享页

分享页是 persona 页的轻量承接页，重点不是解释，而是“继续聊”。

## 12.4 创建页

创建页是塑造 persona 的流程，不是配置台。

## 12.5 预览页

预览页优先展示“像不像”，再展示管理动作。

## 12.6 审核页

审核页可以更 operational，但必须仍属于同一套设计系统。

## 13. 文案和内容呈现规则

## 13.1 Slogan Discipline

每个页面都应该尽量只依赖一句主语句。

如果一句文案在解释系统工作原理，而不是推动情绪或行动，优先删掉。

## 13.2 默认文案风格

- 短
- 口语化
- 面向动作
- 不解释系统内部过程

## 13.3 默认隐藏内容

默认隐藏：

- inference jargon
- refusal enums
- 诊断式描述
- 过长 provenance 说明

## 14. 可访问性基线

设计系统必须满足最基本的可访问性要求。

## 14.1 对比度

- 正文和关键操作必须达到最基本可读对比
- 常规正文与背景对比度至少遵循 `4.5:1`
- 大字号标题或粗体大字至少遵循 `3:1`
- 深色模式下不允许靠低对比“营造高级感”

## 14.2 焦点态

- 必须有清晰的 focus-visible
- 键盘和辅助设备用户不能失去操作位置

## 14.3 点击热区

- 移动端主要控件必须具备足够点击面积
- 优先目标：`44 × 44 CSS px`
- 最低可接受目标：`24 × 24 CSS px`，且必须保证有足够间距避免误触
- 发送按钮、导航项、分享入口都不能做成只靠视觉小图标命中的形式

## 14.4 动效克制

- 动效不应影响可读性和方向判断
- 聊天主路径必须对低注意力、低亮度环境友好

## 15. 设计治理规则

## 15.1 真相源

设计真相源的优先级：

1. `docs/design-system-specification.md`
2. `DESIGN.md`
3. `packages/ui-tokens/src/index.ts`

如果三者冲突，优先按这个顺序收敛。

## 15.2 实现规则

新增 UI 时：

1. 先判断属于哪个页面模式
2. 先复用 semantic token
3. 必要时再新增 component token
4. 最后才允许扩展 primitive 值

禁止：

- 直接在页面里写与 token 脱节的临时色值
- 用边框替代层级
- 把后台样式直接搬进主产品页

## 15.3 审核标准

一个页面如果出现以下任一情况，应判定为设计偏离：

- 看起来像后台
- 看起来像卡片信息流
- 说明文案比聊天内容更抢眼
- 主题色没有承担交互角色
- persona 页首屏不是聊天

## 16. 参考规范

这份文档吸收了几类外部规范思路：

- Figma 关于 design tokens 的分层方法：
  - primitive
  - semantic
  - component-specific
- W3C/WCAG 关于基础可访问性的要求：
  - 对比度
  - 焦点态
  - 可点击面积
- 当前项目已确定的产品定位与设计方向稿

这份文档现在应被视为 Hall of Fame 的设计系统规范基线。
