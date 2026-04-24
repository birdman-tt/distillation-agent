# Chat Memory Tooling Proposal

## 1. 目标

为在线聊天链路增加一个**标准化的会话记忆检索工具**。

要求：

- 所有聊天记录持续写入数据库
- 每次用户发消息后，在调用模型前先执行一次固定的工具步骤
- 工具只搜索**当前 chat session** 内的历史消息
- 如果搜索到相关历史，则把检索结果拼进下一次发给模型的输入
- 工具需要有明确的输入输出协议，后续可以扩展为统一 tool runtime

这一步的核心目的不是“多做一个花哨能力”，而是解决当前聊天的几个根问题：

- 模型只看到单轮问题，缺乏上下文连续性
- 用户追问时，模型无法稳定承接上一轮内容
- 对话会反复“重新开题”，流畅度差

## 2. 当前现状

当前代码里：

- `chat_messages` 已经持久化，见 `apps/api/src/db/schema.sql`
- `savePersistedChatSession/getPersistedChatSession` 已经读写整段聊天，见 `apps/api/src/db/repositories/chat-repository.ts`
- `/v1/chats/:chatId/messages` 在模型前**没有**执行“历史检索”步骤，见 `apps/api/src/routes/chats.ts`
- 当前模型输入主要是：
  - 本轮用户问题
  - persona version 画像
  - persona evidence

也就是说，当前缺的不是“聊天是否存库”，而是：

- 缺一个**标准检索 tool**
- 缺一次**模型前 memory retrieval**
- 缺一套**稳定的 tool I/O 协议**

## 3. 方案结论

### 3.1 总体策略

V1 不采用“让模型自己决定要不要调工具”的 agent 模式。

而是采用：

- **后端工作流强制前置执行**
- **deterministic orchestration**
- **tool 只是标准化能力单元，不是自由 agent 行为**

原因：

- 这是必经步骤，不是可选能力
- 检索范围和过滤规则必须可控
- 当前聊天链路是单轮单次生成，不适合先引入开放式 tool-calling runtime

### 3.2 V1 工具定义

V1 只引入一个标准 tool：

- `search_chat_memory`

职责：

- 在当前 `chatId` 作用域下检索与本轮用户消息相关的历史对话
- 返回有限条相关片段，供 prompt 组装

V1 明确不做：

- 跨 chat 检索
- 全站用户长期记忆
- 让模型自己发起多轮工具调用
- embedding provider 依赖

## 4. 推荐流程

每次用户发送消息时：

1. `persist incoming user message`
2. `classify current question`
3. `search_chat_memory`
4. `load persona evidence`
5. `assemble model input`
6. `generate answer`
7. `persist assistant message`

其中第 3 步是本次新增重点。

## 5. Tool 标准接口

### 5.1 Tool Name

`search_chat_memory`

### 5.2 Version

`v1`

### 5.3 输入协议

```ts
type SearchChatMemoryToolInput = {
  toolName: "search_chat_memory";
  version: "v1";
  requestId: string;
  chatId: string;
  personaId?: string | null;
  personaVersionId: string;
  query: string;
  latestMessageId?: string | null;
  options?: {
    topK?: number;              // default 6
    maxTokensHint?: number;     // default 900
    includeAssistant?: boolean; // default true
    includeUser?: boolean;      // default true
    minScore?: number;          // default internal threshold
    excludeRecentTurns?: number;// default 1, 避免把刚发的消息再检出来
  };
};
```

### 5.4 输出协议

```ts
type SearchChatMemoryToolOutput = {
  toolName: "search_chat_memory";
  version: "v1";
  requestId: string;
  chatId: string;
  query: string;
  hits: Array<{
    messageId: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
    score: number;
    reason:
      | "lexical_match"
      | "followup_reference"
      | "topic_overlap"
      | "recent_anchor";
    turnDistance: number;
  }>;
  summary: {
    totalHits: number;
    returnedHits: number;
    truncated: boolean;
    retrievalMode: "fts_only" | "fts_plus_recent";
  };
};
```

### 5.5 错误协议

```ts
type SearchChatMemoryToolError = {
  toolName: "search_chat_memory";
  version: "v1";
  requestId: string;
  error: {
    code:
      | "CHAT_NOT_FOUND"
      | "INVALID_INPUT"
      | "REPOSITORY_ERROR";
    message: string;
  };
};
```

## 6. Tool 行为约束

`search_chat_memory` 必须遵守这些约束：

- 只检索当前 `chatId`
- 默认排除“刚写入的当前用户消息”本身
- 优先召回：
  - 最近几轮强相关消息
  - 被本轮追问/指代到的历史消息
  - 主题重合的历史消息
- 返回的不是原始整段聊天，而是**有限条 recall 结果**
- 必须有 `topK` 和 token 预算
- 工具为空时返回 `hits: []`，不报错

## 7. 检索策略

### 7.1 V1 检索方式

延续当前项目既有口径：

- 使用本地全文检索
- 使用 metadata filter
- 不引入 hosted embedding API

V1 推荐做法：

- 为 `chat_messages.content` 建立 `tsvector`
- 增加 `GIN` 索引
- 结合最近轮次做轻量 rerank

### 7.2 V1 排序建议

最终得分建议由三部分组成：

- `lexicalScore`
- `recencyScore`
- `roleWeight`

一个简单可用的打分模型：

```txt
finalScore = lexicalScore * 0.65 + recencyScore * 0.25 + roleWeight * 0.10
```

其中：

- `lexicalScore`: PostgreSQL FTS rank
- `recencyScore`: 越近越高
- `roleWeight`: assistant 历史略高于 user 历史，因为更适合作为“可承接语境”

### 7.3 V1 特殊增强

为了让追问更顺：

- 若当前输入包含“刚才 / 上面 / 你说的 / 那为什么 / 所以呢 / 继续说 / 展开讲讲”这类追问指示词
- 则强制把最近 `N=2~4` 轮对话带入，即使 lexical 匹配一般

这一步很重要，因为纯关键词检索对口语化追问不稳定。

## 8. Prompt 组装方式

### 8.1 不建议的做法

不建议直接把完整历史聊天全量拼进 prompt。

问题：

- token 浪费
- 噪声高
- 容易把模型拉进无关旧话题

### 8.2 建议做法

模型输入分 3 层：

1. `recent turns`
2. `retrieved memory hits`
3. `persona evidence`

推荐结构：

```txt
[System Prompt]
你正在扮演...

[Recent Conversation Window]
- USER: ...
- ASSISTANT: ...
- USER: ...
- ASSISTANT: ...

[Retrieved Chat Memory]
- hit_1 | role=ASSISTANT | score=0.81 | ...
- hit_2 | role=USER | score=0.73 | ...

[Persona Evidence]
- source_1 ...
- source_2 ...

[Current User Message]
...
```

### 8.3 Recent Window 规则

即使有 memory tool，也建议固定再带：

- 最近 `2~4` 轮原始对话

因为“最近窗口”解决的是连续性，
“检索命中”解决的是跨几轮的相关回忆。

两者不应该二选一。

## 9. 数据层改造建议

### 9.1 最小改造

在 `chat_messages` 上增加：

- `content_tsv TSVECTOR`
- `created_at` 复合索引
- `chat_id + created_at` 索引

示意：

```sql
alter table chat_messages
  add column content_tsv tsvector;

create index chat_messages_content_tsv_idx
  on chat_messages using gin (content_tsv);

create index chat_messages_chat_id_created_at_idx
  on chat_messages (chat_id, created_at desc);
```

### 9.2 推荐补充字段

如果后续想把 tool 做稳，建议再补：

- `turn_index integer`
- `token_count integer`
- `message_metadata jsonb`

这样后续更容易：

- 控制 recent window
- 做 token budget
- 做角色/阶段筛选

### 9.3 是否需要新表

V1 不必立即拆新表。

先用：

- `chats`
- `chat_messages`

就能完成当前需求。

只有在后续要支持：

- 跨 chat 长期记忆
- 摘要记忆
- embedding 检索

时，再考虑新增：

- `chat_memory_segments`
- `chat_memory_summaries`

## 10. 服务层设计

推荐新增：

- `apps/api/src/services/chat-memory/search-chat-memory.ts`
- `apps/api/src/services/chat-memory/assemble-chat-context.ts`

职责拆分：

### `search-chat-memory.ts`

- 参数校验
- 当前 chat 检索
- 排序与裁剪
- 返回标准 tool output

### `assemble-chat-context.ts`

- recent window 提取
- tool hits 合并
- persona evidence 合并
- token budget 裁剪
- 产出最终 prompt input

## 11. 工作流接入点

当前最佳接入点在：

- `apps/api/src/routes/chats.ts`
- `apps/api/src/workflows/chat/run-chat-workflow.ts`

推荐改造方式：

### Route 层

Route 层职责：

- 持久化当前用户消息
- 调用 `search_chat_memory`
- 获取 recent window
- 组装 `dynamicContext`

### Workflow 层

Workflow 层职责：

- 接收已经组装好的 chat context
- 做分类
- 做 persona evidence 约束
- 发起最终模型生成

这样可以保证：

- tool orchestration 不侵入模型调用封装
- workflow 仍保持单次生成职责

## 12. Contract 建议

建议新增 shared contracts：

- `packages/contracts/src/chat-tools.ts`

包含：

- `searchChatMemoryToolInputSchema`
- `searchChatMemoryToolOutputSchema`
- `searchChatMemoryToolErrorSchema`

同时建议给 chat workflow 新增 context contract：

```ts
type ChatContextEnvelope = {
  recentTurns: Array<{
    role: "USER" | "ASSISTANT";
    content: string;
  }>;
  retrievedMemories: Array<{
    role: "USER" | "ASSISTANT";
    content: string;
    score: number;
    createdAt: string;
  }>;
  personaEvidence: Array<{
    sourceId: string;
    title: string | null;
    snippet: string;
  }>;
};
```

## 13. 输出给模型的标准

模型前最终输入建议满足：

- `recentTurns` 永远存在，但有长度上限
- `retrievedMemories` 可空
- `personaEvidence` 继续保留
- 当前轮问题单独放最后

规则：

- 若 tool 无命中，不中断流程
- 若 tool 命中过多，按 token budget 裁剪
- 若 recent turns 与 retrieved memory 重复，优先保留 recent turns

## 14. 为什么这套方案能提升流畅度

它主要解决三件事：

### 14.1 解决承接问题

模型能看到“你们刚刚在说什么”，不再每轮重开。

### 14.2 解决追问问题

用户说“刚才那点展开讲讲”时，模型能知道“刚才那点”是哪点。

### 14.3 解决主题漂移问题

模型既能承接当前 chat 里的历史，又不会被整段长历史淹没。

## 15. 风险与边界

### 风险 1：检索噪声

如果只用关键词检索，容易召回表面相似但实际无关的消息。

应对：

- recent-window 保底
- topK 限制
- recency rerank

### 风险 2：上下文太长

把 recent turns、retrieved memories、persona evidence 都塞进去后，prompt 会膨胀。

应对：

- 统一 token budget
- 优先级排序：recent > retrieved > low-score memory

### 风险 3：人格资料和历史语境冲突

用户前文里可能说过一些偏题内容，和 persona 约束冲突。

应对：

- persona evidence 继续保留更高优先级
- memory 作为“会话承接信息”，不是事实真相来源

## 16. 分阶段实施建议

### Phase A

先完成最小闭环：

- `chat_messages` 建 FTS 索引
- 新增 `search_chat_memory` tool
- recent window + retrieval hits 拼入模型输入

### Phase B

增强质量：

- 指代追问规则
- 轻量 rerank
- token budget 裁剪器

### Phase C

扩展为统一 tool runtime：

- tool registry
- tool trace
- more tools:
  - `search_persona_evidence`
  - `search_user_long_term_memory`

## 17. 最终建议

这次需求建议定成下面这句：

> 每次用户发送消息后，系统必须先执行 `search_chat_memory` 工具，在当前 chat session 内检索相关历史消息；命中的历史上下文会和最近几轮对话、persona evidence 一起组装后再发送给模型，以提升多轮对话的承接性与流畅度。

对应落地策略：

- V1 先做 deterministic orchestration
- V1 只做当前 chat 内检索
- V1 使用 Postgres 本地全文检索
- 统一 tool input/output contract
- 保留后续升级到统一 tool runtime 的空间
