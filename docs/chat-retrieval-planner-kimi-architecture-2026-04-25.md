# Chat Retrieval-First、Fast Planner 与 Kimi Researcher 架构方案

日期：2026-04-25

## 1. Summary

本方案调整当前聊天主链路：不再依赖每轮给 DeepSeek 发送超大 prompt，也不让 MiniMax Planner 承担最终回复。最终确认后的 V1 架构拆成四层：

```text
pgvector + FTS + user_memory_facts = 每轮默认上下文检索
Fast Planner = 同步低延迟路由判断
Kimi Researcher = 最新信息联网研究，V1 直接接入
DeepSeek Responder = 唯一最终用户可见回复
MiniMax Async Planner = 后台深度复盘与复杂主动消息候选
```

核心目标：

- 对话历史和蒸馏资料进入向量库，减少每轮 prompt 体积。
- 每轮默认执行 retrieval，不由 Planner 判断是否查上下文。
- 同步 Planner 必须低延迟，默认使用 DeepSeek non-thinking compact JSON。
- Kimi 只在需要最新信息时触发，不参与普通聊天，不生成最终用户回复。
- DeepSeek 只消费已经整理好的 `Context Pack`，负责最终人格化回答。
- MiniMax 不进入同步热路径，只保留为异步深度 Planner/复盘能力。
- 保留 trace，可解释每轮带了哪些上下文、为什么联网、最终 prompt 大小。

已确认 V1 决策：

```text
Embedding: Qwen text-embedding-v4, 1024 dimensions
Vector DB: 当前 Supabase/PostgreSQL 直接启用 pgvector
Retrieval: 每轮默认执行 recent + user facts + vector + FTS/exact
Fast Planner: 默认 DeepSeek `deepseek-v4-flash`，关闭 thinking，输出紧凑 JSON
MiniMax Planner: 不放同步主链路；只做异步深度复盘、复杂 proactive 候选
Kimi: V1 直接接入，只做最新信息 Researcher，模型 kimi-k2.5
DeepSeek: 唯一最终回复模型
user_memory_facts: V1 后端能力，V1.1 用户可见管理入口
```

## 1.1 2026-04-26 模型选型更新

本地同口径测试显示，MiniMax-M2.7 用作同步 planner 的端到端耗时明显高于聊天主链路预算：

| 模型 | planner 模式 | 平均耗时 | P95 | 结论 |
| --- | --- | ---: | ---: | --- |
| DeepSeek `deepseek-v4-flash` | `thinking: disabled` + compact JSON | 约 `1.15s` | 约 `1.65s` | 适合同步 Fast Planner |
| Kimi `kimi-k2.5` | `thinking: disabled` + compact JSON | 约 `1.85s` | 约 `2.54s` | 可作为 Fast Planner 备选，更擅长 fresh/tool 判断 |
| MiniMax `MiniMax-M2.7` | `reasoning_split: true` + compact JSON | 约 `6.2s` | 约 `11.9s` | 不适合同步热路径 |

关键结论：

- MiniMax 慢不是因为当前同步 planner 在做 tool call；decision-only 请求没有传 `tools`。
- MiniMax-M2.7 更适合 Agentic / Interleaved Thinking / 多轮 Function Call 场景。
- 即使 `MiniMax-M2.7-highspeed` 能降低部分生成时间，也不能稳定压进 `2s` planner 预算。
- 后续开发不要把 MiniMax-M2.7 放回每轮同步聊天链路；如果要用，必须是异步后台任务或用户可接受等待的深度计划任务。
- 同步 planner 默认使用 `CHAT_FAST_PLANNER_PROVIDER=deepseek`，如需让模型更多承担 fresh/tool 判断，可切到 `kimi`。

## 2. 背景问题

当前方向已经暴露出三个问题：

1. 直接塞大历史给 DeepSeek 可以缓解失忆，但长期会增加输入 token、延迟和噪声。
2. MiniMax Planner 如果每轮都进入热路径，即使不做 tool loop，也会拖慢回复。
3. 用户问“最新发生的事”时，DeepSeek 只能基于模型旧知识回答，需要一个联网 Researcher。

DeepSeek 当前 `deepseek-v4-flash` / `deepseek-v4-pro` 官方上下文长度为 `1M`，最大输出为 `384K`，但 `/chat/completions` 多轮上下文仍需要请求侧传历史，服务端不会自动替业务保存会话记忆。

参考：

- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek Context Caching](https://api-docs.deepseek.com/guides/kv_cache)
- [Kimi API Overview](https://platform.kimi.com/docs/api/overview)
- [Kimi Models](https://platform.kimi.com/docs/models)
- [Kimi Tool Calls](https://platform.kimi.com/docs/guide/use-kimi-api-to-complete-tool-calls)
- [Kimi Official Tools](https://platform.kimi.com/docs/guide/use-official-tools)

## 3. 目标架构

```text
用户消息
-> POST /v1/chats/:chatId/messages
-> 后端落 USER message
-> Context Retriever 每轮默认执行检索
   -> recent turns
   -> user facts
   -> chat vector memory
   -> persona vector chunks
   -> FTS / exact match
-> 如果命中联网/主动消息/复杂计划触发条件
   -> MiniMax Planner 生成 TurnPlan
-> 如果 TurnPlan.needWebSearch=true
   -> Kimi Researcher 调用 web-search
   -> Kimi 输出明文 WebContext
-> Prompt Builder 组装小 prompt
-> DeepSeek Responder 生成最终回复
-> 后端落 ASSISTANT message
-> WS 推送 / HTTP 兼容返回 / trace 落库
```

关键原则：

- MiniMax 只做 Planner，不直接写用户可见回复。
- MiniMax 不每轮调用，避免把普通聊天变成慢链路。
- Kimi 只做最新信息 Researcher，不做通用规划，不做最终回复。
- DeepSeek 是唯一最终用户可见回复模型。
- 向量库和 FTS 是默认上下文来源，不再每轮发送超大完整历史。
- 最近几轮对话仍直接带入 prompt，避免 embedding 异步延迟导致刚说完就忘。

## 4. 模型职责

### 4.1 Fast Planner

同步 Planner 的职责是快速判断本轮是否需要聊天记忆、人物资料、联网搜索或主动消息候选。

默认配置：

```text
CHAT_PLANNER_ENABLED=true
CHAT_PLANNER_MODE=decision
CHAT_FAST_PLANNER_PROVIDER=deepseek
CHAT_FAST_PLANNER_MODEL=deepseek-v4-flash
CHAT_PLANNER_TIMEOUT_MS=2000
```

可选配置：

```text
CHAT_FAST_PLANNER_PROVIDER=kimi
CHAT_FAST_PLANNER_MODEL=kimi-k2.5
```

Fast Planner 输出紧凑 JSON，后端再 normalize 成 `ChatTurnPlan`：

```ts
type FastTurnDecision = {
  m: 0 | 1 | 2 | 3; // casual / domain / fact / high-risk
  i: 0 | 1 | 2; // low / medium / high persona intensity
  cm: boolean; // need chat memory
  pk: boolean; // need persona knowledge
  ws: boolean; // need web search
  q: string | null; // web search query
  pro: boolean; // proactive candidate
};
```

本地 Hard Guard 只覆盖确定性场景：

- 问今天、现在、今年、这个月、最新、新闻、上市、实时：强制 `needWebSearch=true`。
- 问刚才、记得、我叫什么、我的偏好、之前说过什么：强制 `needChatMemory=true`。
- 问提醒、稍后、几分钟后、下次继续：强制 `proactiveCandidate=true`。

### 4.2 MiniMax Async Planner

MiniMax 的职责不是同步判断“要不要查上下文”。上下文检索每轮都执行；Fast Planner 负责同步低延迟路由。MiniMax-M2.7 只适合放在异步深度计划中，例如：

```text
用户要求总结、比较、计划、复杂拆解
用户明显希望 AI 连续多条回复
后台复盘是否提取长期用户记忆
后台判断是否生成 proactive job 候选
后台总结对话主题、情绪和长期偏好
```

MiniMax 输出：

```ts
type TurnPlan = {
  intent: string;
  answerMode:
    | "casual"
    | "domain"
    | "memory_recall"
    | "fresh_info"
    | "high_risk"
    | "proactive_candidate";
  retrievalHints: {
    focusQueries: string[];
    boostScopes: Array<"user_facts" | "chat_memory" | "persona_chunks">;
  };
  needWebSearch: boolean;
  webSearchQuery: string | null;
  webSearchReason: string | null;
  personaIntensity: "low" | "medium" | "high";
  shouldSendMultipleMessages: boolean;
  suggestedMessageCount: 1 | 2 | 3;
  traceReason: string;
};
```

Planner 约束：

- 输出必须是 JSON，不输出自然语言回复。
- 不直接调用 Kimi，不直接调用 DeepSeek。
- 不直接发送用户可见消息。
- 不放入每轮同步聊天热路径。
- 异步 timeout 可放宽到 `10000-15000ms`，但失败不能影响已经返回给用户的回复。
- 如果未来必须在同步链路启用 MiniMax，需要明确产品接受等待，并在 trace 中记录 `plannerProvider=minimax`、latency 和 fallback。

Planner 未触发或失败时的默认增强计划：

```ts
{
  answerMode: "casual",
  retrievalHints: {
    focusQueries: [currentUserMessage],
    boostScopes: []
  },
  needWebSearch: false,
  webSearchQuery: null,
  personaIntensity: "low",
  shouldSendMultipleMessages: false,
  suggestedMessageCount: 1
}
```

### 4.3 pgvector + FTS Retriever

Retriever 负责确定性查上下文，不让 LLM 每轮凭感觉决定最终带什么内容。

检索来源：

- `recent turns`：最近 N 条直接带。
- `user facts`：用户名字、外号、偏好、关系、长期事实。
- `chat message vectors`：历史消息语义召回。
- `persona source chunks`：蒸馏资料原始片段召回。
- `persona profile chunks`：蒸馏后的 profile、风格、原则、样例召回。
- `FTS / exact match`：姓名、外号、日期、数字、股票代码、专有名词兜底。

检索结果统一生成 `ContextPack`：

```ts
type ContextPack = {
  recentTurns: ContextItem[];
  userFacts: ContextItem[];
  chatMemories: ContextItem[];
  personaChunks: ContextItem[];
  exactMatches: ContextItem[];
  diagnostics: {
    retrievalQueries: string[];
    tokenBudget: number;
    totalCandidates: number;
    selectedCount: number;
    truncated: boolean;
  };
};
```

### 4.4 Kimi Researcher

Kimi 只在 `TurnPlan.needWebSearch=true` 时触发，职责是联网查最新信息并整理成明文上下文。

Kimi 输入：

```ts
type KimiResearchInput = {
  userMessage: string;
  webSearchQuery: string;
  plannerReason: string;
  locale: "zh-CN";
  maxFindings: number;
};
```

Kimi 输出：

```ts
type WebContext = {
  query: string;
  freshnessStatus: "fresh" | "uncertain" | "not_found";
  keyFindings: string[];
  sources: Array<{
    title: string;
    url: string;
    publishedAt?: string | null;
    snippet?: string | null;
  }>;
  uncertainty: string | null;
};
```

关键注意：

- Kimi 官方 web-search 工具结果可能包含 `encrypted_output`，不应该直接交给 DeepSeek。
- 正确做法是让 Kimi 完成 tool loop 后，输出明文 `WebContext`。
- DeepSeek 只读 `WebContext`，不读 Kimi 的原始工具返回。
- 如果 Kimi 失败，DeepSeek 仍可回复，但必须说明“我这里没有查到可靠最新信息”，不能编造。

### 4.4 DeepSeek Responder

DeepSeek 是唯一最终回复模型。

DeepSeek prompt 输入：

```text
[Persona Runtime Rules]
[Turn Plan Summary]
[Context Pack]
[Optional WebContext]
[Current User Message]
```

DeepSeek 约束：

- 普通闲聊不要强行人设表演。
- 命中人物领域时才显露人物判断框架和代表表达。
- 需要最新信息时，必须优先引用 `WebContext`，不能用旧知识硬答。
- 没有检索到事实时，不要编造用户过往信息。
- 高风险问题只给原则、边界和风险提示。

## 5. 数据设计

V1 embedding 模型确认：

```text
Provider: Qwen
Model: text-embedding-v4
Dimensions: 1024
pgvector column: vector(1024)
```

选择原因：

- 中文语义检索适配度更高。
- 有明确 embedding 模型和固定维度，适合 pgvector 建表和索引。
- `1024` 维是 V1 成本、存储和召回质量的平衡点。
- 后续可以继续接 Qwen rerank 做二次排序。
- DeepSeek 当前主要用于 chat/reasoner，不作为 embedding provider。

### 5.1 chat_message_embeddings

```ts
{
  id: string;
  chatId: string;
  messageId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  embedding: vector;
  turnIndex: number;
  createdAt: string;
  embeddedAt: string;
  embeddingModel: string;
}
```

用途：

- 召回旧聊天记忆。
- 支持“我刚才/上次说过什么”“我叫什么”“继续那个话题”。

### 5.2 persona_source_chunk_embeddings

```ts
{
  id: string;
  personaId: string;
  personaVersionId: string;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  embedding: vector;
  embeddingModel: string;
  createdAt: string;
}
```

用途：

- 从原始资料召回证据。
- 支持领域问题更准确 grounding。

### 5.3 persona_profile_chunk_embeddings

```ts
{
  id: string;
  personaVersionId: string;
  section: "summary" | "principles" | "style" | "examples" | "topic_strengths";
  content: string;
  embedding: vector;
  embeddingModel: string;
  createdAt: string;
}
```

用途：

- 召回蒸馏后的高密度人格资料。
- 比原始 source 更贴近最终回复口吻和判断框架。

### 5.4 user_memory_facts

```ts
{
  id: string;
  chatId: string;
  factType: "name" | "nickname" | "preference" | "relationship" | "location" | "long_term_note";
  factValue: string;
  sourceMessageId: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}
```

用途：

- 不把“用户名字/外号/偏好”完全交给向量相似度。
- 解决精确事实类 recall。

`user_memory_facts` 不是向量库的替代品，而是一个结构化长期记忆表。它存的是从用户消息里抽出来的稳定事实，例如：

```text
用户说：“我叫小雨，外号大铁锤。”
-> factType=name, factValue=小雨
-> factType=nickname, factValue=大铁锤

用户说：“我最近在学投资。”
-> factType=preference, factValue=最近在学投资
```

为什么需要它：

- 向量检索适合语义相似，但不擅长稳定回答精确事实。
- “我叫什么？”和“我叫小雨”语义接近，但向量召回仍可能受上下文、分数阈值、chunk 粒度影响。
- 结构化 facts 可以用确定性查询直接命中，作为向量检索的兜底和增强。

建议 V1 只抽取低风险、用户显式表达的事实：

```text
name
nickname
preference
relationship
location
long_term_note
```

不建议 V1 抽取敏感事实或模型推断事实。所有 fact 都必须能追溯到 `sourceMessageId`，方便删除、纠错和 trace。

V1 必须实现 `user_memory_facts`。它和向量检索一起进入首版 retrieval 架构，不能后置，否则“我叫什么/我外号是什么/我上次说我喜欢什么”这类基础记忆问题仍然不稳定。

V1 抽取时机：

```text
USER message 落库
-> 异步 fact extraction job
-> 只抽用户显式表达的低风险事实
-> upsert user_memory_facts
```

V1 查询时机：

```text
每轮 Context Retriever
-> 根据 MiniMax TurnPlan scopes 和当前 query
-> 先查 user_memory_facts
-> 再查 chat/persona vectors 和 FTS
-> 合并进 ContextPack
```

V1 纠错规则：

- 用户说“我不叫小雨了，叫小王”时，新 fact 覆盖旧 fact，并保留旧 fact 的 source trace。
- 用户说“你记错了”时，当前回复不能强答，应提示用户重新确认。
- 后续需要提供删除入口；V1 至少保证 fact 能按 `chatId` 和 `sourceMessageId` 删除。

## 6. 写入策略

### 6.1 用户和 assistant 消息

```text
写 chat_messages 成功
-> 异步 enqueue embedding job
-> 生成 embedding
-> upsert chat_message_embeddings
-> 可选抽取 user_memory_facts
```

要求：

- embedding 异步，不阻塞用户发消息。
- 最近消息直接进入 prompt，不依赖 embedding 生成完成。
- embedding job 失败可重试，不影响主聊天链路。

### 6.2 人物资料和蒸馏 profile

```text
source ingest / distill 完成
-> source chunking
-> profile section chunking
-> enqueue embedding jobs
-> upsert persona source/profile embeddings
```

chunk 策略：

- source chunk 建议 `500-900` 中文字左右，保留 sourceId 和 chunkIndex。
- profile chunk 按 section 切，不要整份 profile 一条 embedding。
- chunk metadata 必须可回溯到来源，方便 trace 和 debug。

## 7. 检索策略

推荐 hybrid retrieval：

```text
1. 最近历史直接带入
2. user facts 精确匹配
3. chat_message_embeddings vector search
4. persona_source/profile vector search
5. FTS / exact match 兜底
6. 合并去重
7. rerank
8. token budget 裁剪
```

排序建议：

```text
finalScore =
  vectorScore * 0.55
  + ftsScore * 0.2
  + recencyScore * 0.15
  + scopeBoost * 0.1
```

不同问题的 scope boost：

- `memory_recall`：提升 `user_facts` 和 `chat_memory`。
- `domain`：提升 `persona_chunks`。
- `fresh_info`：提升 `webContext`，但仍保留 persona/personality context。
- `casual`：只保留最近历史和少量 user facts。

## 8. Prompt 组装策略

目标是让 DeepSeek 收到小而准的 prompt，而不是每轮巨大 prompt。

建议预算：

```text
system/persona rules: 2K-4K tokens
recentTurns: 2K-8K tokens
userFacts: 1K tokens
chatMemories: 2K-6K tokens
personaChunks: 3K-8K tokens
webContext: 2K-6K tokens
current user message: 原文
output reserve: 2K-4K tokens
```

V1 可以先保守控制在 `20K-40K` input tokens 内。DeepSeek 虽然支持 `1M`，但日常聊天没有必要常态化打满。

## 9. 环境变量预留

MiniMax：

```env
MINIMAX_API_KEY=
MINIMAX_BASE_URL=
MINIMAX_PLANNER_MODEL=
CHAT_PLANNER_ENABLED=true
CHAT_PLANNER_TIMEOUT_MS=5000
```

Kimi：

```env
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.5
KIMI_WEB_SEARCH_ENABLED=true
KIMI_WEB_SEARCH_FORMULA_URI=moonshot/web-search:latest
KIMI_TIMEOUT_MS=12000
KIMI_MAX_TOOL_CALLS=3
```

兼容 Moonshot 官方命名：

```env
MOONSHOT_API_KEY=
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
```

Embedding / Retrieval：

```env
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIMENSIONS=1024
CHAT_VECTOR_RETRIEVAL_ENABLED=true
PERSONA_VECTOR_RETRIEVAL_ENABLED=true
CHAT_RETRIEVAL_MAX_CONTEXT_TOKENS=40000
CHAT_RETRIEVAL_RECENT_TURNS=12
CHAT_RETRIEVAL_CHAT_TOP_K=8
CHAT_RETRIEVAL_PERSONA_TOP_K=8
```

## 10. Trace 设计

每轮至少记录：

```text
chat.retrieval.started
chat.retrieval.completed
chat.prompt.built
chat.model.request.started
chat.model.response.normalized
chat.turn.completed
```

条件触发时记录：

```text
chat.planner.request.started
chat.planner.plan.generated
chat.kimi.research.started
chat.kimi.research.completed
```

关键 artifact：

```text
planner_plan
retrieval_queries
retrieved_context_pack
kimi_web_context
system_prompt
user_prompt
raw_model_response
final_assistant_message
```

不要在生产默认保存超大 raw chunks，可以使用 metadata-only 或采样保存。

## 11. 失败与降级

### 11.1 Planner 失败

```text
跳过增强计划，使用已完成的 retrieval context
不联网
继续 DeepSeek 回复
trace 记录 planner failed
```

### 11.2 向量库失败

```text
降级 recent turns + FTS + user facts
不阻塞聊天
trace 记录 vector retrieval failed
```

### 11.3 Kimi 失败

```text
DeepSeek 继续回复
如果用户明确问最新信息，需要明确说明没有可靠联网结果
trace 记录 Kimi failed
```

### 11.4 DeepSeek 失败

```text
沿用现有 fallback
不要让 Kimi 或 MiniMax 直接替代最终回复
```

## 12. 分阶段落地

### Phase 1: 文档与开关

- 明确模型职责。
- 预留 Kimi env，并确认 V1 接入 Kimi Researcher。
- 保留 MiniMax Planner feature flag。
- trace 增加 retrieval 结构规划。

### Phase 2: pgvector 基础设施

- 在当前 Supabase/PostgreSQL 启用 pgvector extension。
- 新增 embeddings 表。
- 新增 embedding job。
- source/profile/message 异步写入向量。
- embedding 模型使用 Qwen `text-embedding-v4`，维度 `1024`。

### Phase 3: Retrieval Context Pack

- 实现 chat/persona vector retrieval。
- 实现 `user_memory_facts` 写入、查询、覆盖和删除能力。
- 实现 FTS/exact 兜底。
- DeepSeek prompt 改为消费 `ContextPack`。

### Phase 4: MiniMax Planner Contract 收敛

- Planner 只输出 `TurnPlan`。
- 不再做复杂多轮工具 loop。
- Planner timeout 缩短。
- Planner 失败不影响检索和回复。
- Planner 默认不每轮调用，只处理联网、主动消息和复杂计划。

### Phase 5: Kimi Researcher

- 实现 Kimi client。
- 接入 Kimi official web-search。
- 输出 `WebContext`。
- 只在 `needWebSearch=true` 时调用。
- V1 直接接入，默认模型使用 `kimi-k2.5`。

### Phase 6: 评估与调参

- 对比旧链路与新链路：
  - 回复延迟
  - prompt token
  - 用户事实 recall
  - 人物领域 grounding
  - 最新信息正确率
- trace viewer 支持查看 retrieval 和 Kimi web context。

## 13. Test Plan

- Planner：普通闲聊不调用 Planner；最新新闻/今天/最近触发 Planner 和 web search；主动消息/复杂计划触发 Planner。
- Retrieval：预算内最近历史保留；超预算时裁剪旧历史；向量召回和 FTS 去重。
- Embedding：Qwen `text-embedding-v4` 写入 `vector(1024)`；不同 embedding model/version 不混写。
- User facts：用户说“我叫小雨，外号大铁锤”后，后续问“我叫什么”能命中；用户纠正名字后优先使用新 fact。
- Persona chunks：投资问题能召回芒格投资/风险/决策资料。
- Kimi：needWebSearch=true 时返回 WebContext；Kimi 超时降级；Kimi sources 进入 trace。
- DeepSeek：只根据 ContextPack/WebContext 回复，不编造未检索事实。
- Regression：Kimi 关闭、Planner 失败或向量检索失败时，现有聊天链路仍能降级工作。

## 14. Review Round 1

结论：方案可行，且比“每轮大 prompt + Planner tool loop”更适合当前阶段。

主要优点：

- 职责清晰，最终回复模型唯一。
- 向量检索比超大 prompt 更省成本、更可控。
- Kimi 只处理最新信息，边界明确。
- pgvector 延续 PostgreSQL 事实源，不引入过重基础设施。

主要风险：

- Planner 如果触发条件过宽，仍会把普通聊天拖慢。
- embedding 异步可能导致刚写入的消息暂时不可被向量召回。
- 纯向量召回对姓名、数字、外号不稳定，必须有 FTS/exact/user facts。
- Kimi web-search 工具输出可能不是 DeepSeek 可直接消费的明文，必须由 Kimi 整理。

调整建议：

- Planner prompt 必须小，不携带大历史，只携带当前消息、最近摘要、少量 metadata。
- Planner 默认不每轮调用，retrieval 才是每轮基础设施。
- 最近消息直接带入 DeepSeek prompt，不等 embedding。
- `user_memory_facts` 必须进入 V1，不要后置；否则基础记忆问题仍然会依赖不稳定的向量召回。
- Kimi 输出只接受结构化 `WebContext`。

## 15. Review Round 2

结论：可以落地，但需要控制范围，避免一次性把系统做成复杂 agent 平台。

需要避免的问题：

- 不要让 MiniMax 同时做 Planner、Researcher、Responder。
- 不要让 MiniMax 每轮决定是否查上下文；上下文检索必须是默认基础设施。
- 不要让 Kimi 参与普通聊天，否则成本和延迟会失控。
- 不要一开始引入独立向量数据库，除非 pgvector 性能不足。
- 不要把所有 source chunk 都塞给 DeepSeek，向量库的价值就是筛选。
- 不要把 trace 保存成完整超大 payload，生产默认应 metadata-only。

建议 V1 范围：

- pgvector 表和 embedding job。
- chat/persona/profile 三类向量写入。
- user facts 基础抽取。
- ContextPack prompt。
- MiniMax Planner gated 输出 `TurnPlan`。
- Kimi Researcher 第一版接入，默认使用 `kimi-k2.5`。

## 16. 最终 V1 决策

```text
Embedding 使用 Qwen text-embedding-v4，维度 1024。
pgvector 直接在当前 Supabase/PostgreSQL 启用。
Retrieval 每轮默认执行，不由 Planner 决定。
MiniMax 不每轮调用，只在联网/主动消息/复杂计划时输出 TurnPlan。
Kimi 只做最新信息 Researcher，第一版直接接入，默认使用 kimi-k2.5。
DeepSeek 继续做唯一最终回复模型。
user_memory_facts 进入 V1 后端能力。
用户可见记忆管理入口放到 V1.1。
```

## 17. 实施拆分

```text
1. Supabase/PostgreSQL pgvector schema + embedding job
2. persona/source/profile chunking
3. chat message embedding
4. user_memory_facts
5. ContextPack prompt
6. MiniMax gated TurnPlan 收敛
7. Kimi Researcher 接入
```
