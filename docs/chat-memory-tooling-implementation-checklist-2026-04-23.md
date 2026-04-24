# Chat Memory Tooling Implementation Checklist

## 1. 目标

把“当前 chat 内历史检索”从想法收敛成一套可直接实施的改造清单。

交付目标：

- 每条聊天消息继续持久化入库
- 每次用户发消息后，模型调用前必须先执行一次 `search_chat_memory`
- 检索范围仅限当前 `chatId`
- 检索结果会和 recent turns、persona evidence 一起组装进模型输入
- 全流程有 shared contracts，不靠路由层随手拼 JSON

## 2. 锁定口径

这次实现先锁死为 V1：

- 只做当前 `chatId` 内历史检索
- 不做跨 chat 长期记忆
- 不做 embedding provider 接入
- 不做模型自主 tool-calling
- 不改 chat route surface
- 不改前端请求协议

执行方式：

- 后端 deterministic orchestration
- tool 是标准能力单元，不是 agent 行为

## 3. 当前代码约束

### 3.1 已有基础

- 聊天会话与消息已经持久化，见 `apps/api/src/db/repositories/chat-repository.ts`
- `chat_messages` 表已存在，见 `apps/api/src/db/schema.sql`
- 当前 chat 生成入口在 `apps/api/src/routes/chats.ts`
- 当前 prompt 只吃“本轮问题 + persona evidence”，没有 recent turns / retrieved memory

### 3.2 关键落地约束

`apps/api/src/db/bootstrap.ts` 只会在“库是空的”时执行 `schema.sql`。

这意味着：

- **不能只修改 `schema.sql`**
- 对已有 Supabase 数据库，必须补充一条可重复执行的升级路径

本次实施必须同时处理：

1. 新库初始化
2. 已有库升级

## 4. 实施分包

建议拆成 6 个任务包。

### Task A: 数据库与索引

**目的：** 让 `chat_messages` 支持当前会话内全文检索。

**修改文件：**

- `apps/api/src/db/schema.sql`
- `apps/api/src/db/bootstrap.ts`
- 视需要新增：`apps/api/src/db/migrations/*` 或 `apps/api/src/db/ensure-chat-memory-schema.ts`

**必须完成：**

- 给 `chat_messages` 增加 `content_tsv TSVECTOR`
- 给 `chat_messages` 建 `GIN (content_tsv)` 索引
- 给 `chat_messages` 建 `(chat_id, created_at desc)` 索引
- 持久化写入消息时同步刷新 `content_tsv`

**推荐同时加上：**

- `turn_index INTEGER`
- `message_metadata JSONB DEFAULT '{}'::jsonb`

`turn_index` 的作用：

- recent window 提取更稳
- 追问场景更容易判断“最近几轮”

**升级策略要求：**

- 升级逻辑必须 idempotent
- 在已有 Supabase 库执行时不能破坏现有聊天数据
- 新增列要允许平滑回填

**验收：**

- 空库启动可以自动建出新字段和索引
- 已有库执行升级后，旧消息仍可正常读取
- 新写入消息可以被全文检索命中

### Task B: Shared Contracts

**目的：** 把 memory retrieval 的工具输入输出标准化。

**修改文件：**

- Create: `packages/contracts/src/chat-tools.ts`
- Modify: `packages/contracts/src/index.ts`
- 可选 Modify: `packages/contracts/src/chats.ts`

**必须新增的 schema：**

- `searchChatMemoryToolInputSchema`
- `searchChatMemoryHitSchema`
- `searchChatMemoryToolOutputSchema`
- `searchChatMemoryToolErrorSchema`
- `chatContextEnvelopeSchema`

**建议字段：**

`searchChatMemoryToolInputSchema`

- `toolName`
- `version`
- `requestId`
- `chatId`
- `personaId`
- `personaVersionId`
- `query`
- `latestMessageId`
- `options.topK`
- `options.maxTokensHint`
- `options.includeAssistant`
- `options.includeUser`
- `options.minScore`
- `options.excludeRecentTurns`

`searchChatMemoryToolOutputSchema`

- `toolName`
- `version`
- `requestId`
- `chatId`
- `query`
- `hits[]`
- `summary.totalHits`
- `summary.returnedHits`
- `summary.truncated`
- `summary.retrievalMode`

`chatContextEnvelopeSchema`

- `recentTurns[]`
- `retrievedMemories[]`
- `personaEvidence[]`

**验收：**

- tool input/output 都有 zod 校验
- route/service/workflow 不再手写裸对象 shape

### Task C: Repository 能力

**目的：** 在 repository 层提供“存消息、查 recent turns、查 memory hits”的原子能力。

**修改文件：**

- Modify: `apps/api/src/db/repositories/chat-repository.ts`

**必须新增能力：**

- `appendChatMessages(chatId, messages[])`
- `listRecentChatMessages(chatId, limit)`
- `searchChatMessagesWithinChat(input)`

**当前需要顺手修正：**

现在 `savePersistedChatSession` 每次会：

- `delete from chat_messages where chat_id = ...`
- 然后整段重写

这对 memory retrieval 不友好，也不适合后续做 `turn_index`。

本次建议同步改成：

- chat create 时插入 `chats`
- message append 时只 append 新消息
- `getPersistedChatSession` 继续按 `created_at asc` 读取

**`searchChatMessagesWithinChat` 的检索要求：**

- 必须限定 `chat_id = current chatId`
- 支持 role filter
- 支持 topK
- 支持排除最新 1 条或最近 N 轮
- 返回 score、createdAt、role、content、turnDistance

**V1 排序建议：**

- 先用 FTS rank 初筛
- 再叠加 recency
- assistant 消息略高权重

**验收：**

- 不再整段删除重写 chat messages
- recent turns 与 search hits 都能独立查询
- 检索命中只来自当前 chat

### Task D: Tool Service

**目的：** 把 memory retrieval 变成标准 tool，而不是散落在 route 里的 SQL。

**修改文件：**

- Create: `apps/api/src/services/chat-memory/search-chat-memory.ts`
- Create: `apps/api/src/services/chat-memory/assemble-chat-context.ts`
- 可选 Create: `apps/api/src/services/chat-memory/index.ts`

**职责划分：**

`search-chat-memory.ts`

- 校验 tool input
- 调 repository 检索
- 做命中排序与裁剪
- 返回标准 tool output

`assemble-chat-context.ts`

- 提取 recent turns
- 执行 `search_chat_memory`
- 去重 recent turns 与 retrieved hits
- 合并 persona evidence
- 控制 token budget
- 产出 `chatContextEnvelope`

**必须实现的行为：**

- query 为空时直接返回空 hits
- tool 无命中时不中断 chat
- recent turns 永远优先于 retrieved hits
- retrieved hits 不允许无限增长

**V1 recent turns 建议：**

- 固定取最近 `2~4` 轮

**V1 memory hits 建议：**

- `topK = 4~6`

**验收：**

- route 不直接写检索 SQL
- tool 输出稳定可测
- context envelope 可独立单测

### Task E: Chat Workflow 接入

**目的：** 把 recent turns + retrieved memory 正式接进模型前上下文。

**修改文件：**

- Modify: `apps/api/src/routes/chats.ts`
- Modify: `apps/api/src/workflows/chat/run-chat-workflow.ts`
- Modify: `apps/api/src/workflows/chat/index.ts`
- Modify: `packages/prompt-kit/src/chat/prompts.ts`
- 可选 Modify: `packages/prompt-kit/src/chat/schemas.ts`

**Route 层改造要求：**

当前 `POST /v1/chats/:chatId/messages` 的顺序要改成：

1. load chat session
2. parse input
3. append 当前 user message
4. 获取 recent turns
5. 执行 `search_chat_memory`
6. 组装 `chatContextEnvelope`
7. 调 `runChatWorkflow`
8. append assistant message

**Workflow 层改造要求：**

`runChatWorkflow` 新增输入：

- `recentTurns`
- `retrievedMemories`

不要再只接：

- `content`
- `seed`
- `dynamicContext`

而应改成：

- `content`
- `seed`
- `dynamicContext`
- `chatContext`

**Prompt 改造要求：**

在 `buildChatUserPrompt` 中加入：

- `[Recent Conversation Window]`
- `[Retrieved Chat Memory]`
- `[Persona Evidence]`
- `[Current User Message]`

顺序必须固定。

**重要边界：**

- memory 是“会话承接信息”，不是事实真相来源
- persona evidence 仍然是更高优先级的事实/风格约束

**验收：**

- 模型输入里包含 recent turns
- 命中时包含 retrieved memories
- 无命中时也能正常回复

### Task F: 测试与验收

**目的：** 防止这次改造把 chat 主链路打坏。

**修改文件：**

- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/workflows/chat/run-chat-workflow.test.ts`
- Create: `apps/api/src/services/chat-memory/*.test.ts`
- 可选 Modify: `apps/client/src/chat-behavior.test.ts`

**必须新增测试：**

1. `search_chat_memory` 无命中
2. `search_chat_memory` 命中当前 chat 内旧消息
3. 检索不会跨 chat 泄漏
4. recent turns + retrieved hits 去重正确
5. tool 空结果不影响正常回复
6. append-only chat persistence 正常

**推荐增加集成测试：**

- 创建 chat
- 连续发送 3~5 轮
- 第 4 轮提追问
- 断言第 4 轮上下文里已经带入前文

**最终验收标准：**

- 同一 chat 内追问“刚才那点展开说”时，模型能承接上一轮
- 新消息不会把整段 chat 覆盖重写
- memory retrieval 不跨 chat
- 无需 embedding 也能跑通

## 5. 文件级实施顺序

建议按下面顺序实现，避免来回返工：

1. `schema.sql` + 升级逻辑
2. `packages/contracts/src/chat-tools.ts`
3. `chat-repository.ts`
4. `services/chat-memory/*`
5. `run-chat-workflow.ts`
6. `routes/chats.ts`
7. tests

## 6. 这次不要做的事

为了控制复杂度，这轮不要顺手做：

- embedding schema
- vector db
- 跨 persona 检索
- 用户长期记忆画像
- 模型自主决定是否调用工具
- streaming 改造

这些都属于下一阶段。

## 7. 开发完成定义

这次任务完成，必须同时满足：

- 数据库支持当前 chat 内全文检索
- `search_chat_memory` 有标准 contract
- route 在模型前固定执行 retrieval
- workflow 能接收 chat context
- prompt 吃到 recent turns + retrieved memories
- 关键路径测试补齐

## 8. 实现窗口的一句话任务描述

可以直接把这句话给实现窗口：

> 为 chat 链路增加一个后端强制前置执行的 `search_chat_memory` 工具：在每次用户发消息后，先在当前 `chatId` 内检索相关历史消息，再把 `recent turns + retrieved memories + persona evidence` 一起组装进模型输入；全过程需要共享 contracts、可升级的数据库索引方案，以及 append-only 的 chat message persistence。
