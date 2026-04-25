# Chat Realtime 与主动消息设计

日期：2026-04-24

## 1. 背景

当前聊天主链路是同步的一问一答：

```text
用户发消息
-> POST /v1/chats/:chatId/messages
-> 后端落 USER message
-> 后端组装上下文
-> runChatWorkflow 生成单个 reply
-> 后端落单个 ASSISTANT message
-> HTTP 返回该 assistant message
-> 前端追加一个气泡
```

这套机制适合当前 MVP，但不支持后续更像真人的在线交互：

- AI 在用户在线停留时主动发一条消息
- 用户发一条消息后，AI 分多条气泡连续回复
- AI 显示 typing / 思考 / tool progress
- 后续支持打断、语音、agent 实时事件

本文只讨论在线聊天中的实时能力，不讨论离线通知、Push、微信订阅消息。

## 2. 当前后端为何只支持一问一答

### 2.1 API route 只返回单个 assistant message

当前消息入口在：

[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:124)

核心流程是：

```ts
const rawReply = await runChatWorkflow(...);
const replyPayload = chatReplySchema.parse(rawReply);
const assistantMessage = { ... };
await appendChatMessages(session.id, [assistantMessage]);
return assistantMessage;
```

对应代码位置：

- 调用 workflow：[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:263)
- 解析单个 reply：[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:327)
- 构造单个 assistant message：[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:328)
- 单条落库：[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:339)
- 返回单条消息：[apps/api/src/routes/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/chats.ts:365)

这意味着当前 route 的业务语义是：

```text
one user message -> one assistant message -> one HTTP response
```

### 2.2 Workflow 返回结构也是单个 reply

当前 workflow 在：

[apps/api/src/workflows/chat/run-chat-workflow.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/workflows/chat/run-chat-workflow.ts:233)

它最终返回的是一个 `chatGenerationSchema` 结果，而不是消息数组或事件流：

- 正常模型返回单个 normalized reply：[apps/api/src/workflows/chat/run-chat-workflow.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/workflows/chat/run-chat-workflow.ts:442)
- dynamic fallback 返回单个 reply：[apps/api/src/workflows/chat/run-chat-workflow.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/workflows/chat/run-chat-workflow.ts:493)
- seed fallback 返回单个 reply：[apps/api/src/workflows/chat/run-chat-workflow.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/workflows/chat/run-chat-workflow.ts:518)

当前 prompt-kit 的生成结果也是单条回答，不表达“多条 assistant message”。

### 2.3 Contract 只描述单个 reply

当前 contract 在：

[packages/contracts/src/chats.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/packages/contracts/src/chats.ts:23)

`chatReplySchema` 是单个对象：

```ts
{
  answer: string;
  basis: ...;
  basisSummary: ...;
  inferenceLevel: ...;
  conflictDetected: boolean;
  refusalReason: ...;
}
```

它没有描述：

- 多条 assistant message
- message sequence
- proactive source
- typing/status event
- turn accepted 但 assistant 后续异步到达

### 2.4 Trace 目前也是单 assistant message 视角

当前 trace summary 中只有单个 `assistantMessageId`，collector 也是用 `setAssistantMessageId` 记录单条 assistant 消息。

相关位置：

- [apps/api/src/observability/chat-trace/collector.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/observability/chat-trace/collector.ts:91)
- [packages/contracts/src/chat-traces.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/packages/contracts/src/chat-traces.ts:18)

如果未来一轮产生多条 assistant message，trace 需要从：

```text
assistantMessageId
```

演进为：

```text
assistantMessageIds[]
turn output events
message sequence
```

## 3. 目标

近期目标不是“全面实时聊天平台”，而是在当前 H5 / 小程序在线聊天中支持：

- 用户发一条消息，AI 可以回复多条气泡
- 用户在线停留时，AI 可以偶尔主动发一条消息
- 前端能实时收到新 assistant message
- 所有消息仍然先落库，再投递
- 当前 HTTP 一问一答链路可以平滑迁移

## 4. 非目标

本阶段不做：

- 离线通知
- Web Push
- 微信订阅消息
- 多端消息同步完整方案
- 复杂 agent 长任务编排
- 语音电话实时音频通道
- token-by-token 流式输出

## 5. 推荐架构

推荐采用：

```text
HTTP Chat API: command path
WebSocket Realtime Channel: event delivery path
PostgreSQL: source of truth
```

也就是：

```text
用户发消息仍然走 HTTP
后端生成 assistant messages
assistant messages 先写入 chat_messages
写入成功后通过 WebSocket 推送 chat.message.created
前端收到事件后追加气泡
```

核心原则：

```text
HTTP 负责提交命令
PostgreSQL 负责事实存储
WebSocket 负责在线投递
```

WebSocket 不直接替代所有业务 API，也不作为消息唯一来源。

## 6. 在线用户发消息流程

目标流程：

```text
1. 前端打开聊天页
2. GET /v1/chats/:chatId 加载历史
3. 建立 WS /v1/realtime
4. 订阅 chatId
5. 用户发送消息
6. HTTP POST /v1/chats/:chatId/messages
7. API 落 USER message
8. API 返回 accepted + turnTraceId + userMessageId
9. Chat Runtime 生成一条或多条 ASSISTANT messages
10. 每条 ASSISTANT message 先落库
11. Realtime Gateway 推送 chat.message.created
12. 前端按 message.id 去重并追加气泡
13. Realtime Gateway 推送 chat.turn.completed
```

短期兼容策略：

- `POST /messages` 可以暂时继续返回单个 assistant message
- 前端收到 WebSocket message 后按 `message.id` 去重
- 等 WebSocket 稳定后，再把 HTTP response 改成 `accepted` 语义

## 7. AI 回复多条消息

不要把“多条气泡回复”理解成 token streaming。

目标不是：

```text
一个 assistant message 逐字吐 token
```

而是：

```text
一个 user turn 产生多个 assistant messages
```

示例：

```text
USER: 我今天有点迷茫
ASSISTANT #1: 先别急着把它定义成失败。
ASSISTANT #2: 你现在更像是在几个选择之间失去判断标准。
ASSISTANT #3: 如果只选一个问题先问，我会问：你真正怕失去的是什么？
```

建议后端内部结果从单个 reply 演进为：

```ts
type ChatTurnResult = {
  turnTraceId: string;
  messages: Array<{
    role: "ASSISTANT";
    content: string;
    sequence: number;
    source: "reply";
    basis?: unknown;
    basisSummary?: unknown;
    inferenceLevel?: string;
    conflictDetected?: boolean;
    refusalReason?: string;
  }>;
};
```

对应落库时：

```text
chat_messages.turn_index 继续递增
message_metadata.source = "reply"
message_metadata.turnTraceId = turn_xxx
message_metadata.sequence = 1 | 2 | 3
```

## 8. 在线主动消息流程

主动消息不要走当前 `POST /messages`，因为它没有 user message 触发。

建议新增内部服务语义：

```text
Proactive Trigger
-> Proactive Message Runtime
-> appendChatMessages(chatId, [assistantMessage])
-> emit chat.message.created
```

第一版主动触发可以很简单：

- 用户进入 chat 页面后，超过 `8-15s` 没发消息，AI 发一句 opening
- 用户收到回复后停留 `20-40s`，AI 偶尔补一句 follow-up
- 用户从历史 chat 进入，AI 可以基于最近一轮补一句 continuation

必须加约束：

- 同一个 chat 短时间内最多主动一次
- 有 pending user turn 时不主动插话
- 用户正在输入时不主动插话
- 用户刚收到 assistant message 后要有冷却时间
- 主动消息必须落库
- 主动消息要能被 trace/debug 查看

## 9. Realtime Event Contract

第一版只需要很少事件：

```ts
type RealtimeEvent =
  | {
      type: "chat.subscription.ready";
      chatId: string;
    }
  | {
      type: "chat.turn.started";
      chatId: string;
      turnTraceId: string;
      userMessageId: string;
    }
  | {
      type: "chat.assistant.typing_started";
      chatId: string;
      turnTraceId?: string;
      source: "reply" | "proactive";
    }
  | {
      type: "chat.message.created";
      chatId: string;
      message: {
        id: string;
        role: "ASSISTANT";
        content: string;
        createdAt: string;
        metadata: {
          source: "reply" | "proactive";
          turnTraceId?: string;
          sequence?: number;
        };
      };
    }
  | {
      type: "chat.assistant.typing_stopped";
      chatId: string;
      turnTraceId?: string;
      source: "reply" | "proactive";
    }
  | {
      type: "chat.turn.completed";
      chatId: string;
      turnTraceId: string;
    }
  | {
      type: "chat.turn.failed";
      chatId: string;
      turnTraceId: string;
      message: string;
    };
```

## 10. 后端模块拆分

建议新增三个边界：

```text
Realtime Gateway
- 管理 WebSocket 连接
- 维护 chatId -> connections
- 处理 subscribe/unsubscribe
- 推送 realtime events

Chat Runtime
- 接收 user turn command
- 组装上下文
- 调用 workflow
- 支持一轮生成多条 assistant messages
- 每条消息落库后 emit event

Proactive Engine
- 只处理在线 chat
- 根据 presence / idle / history 触发主动消息
- 复用 Chat Runtime 的上下文组装、消息落库、realtime emit
```

其中 `Chat Runtime` 应该从当前 route 里拆出来。当前 `apps/api/src/routes/chats.ts` 里业务流程太集中，后续要支持主动消息时，需要让“生成 assistant message”不再绑定 HTTP request。

## 11. 前端行为

聊天页进入后：

```text
1. 加载历史消息
2. 建立 WebSocket
3. 订阅当前 chatId
4. 监听 chat.message.created
5. 按 message.id 去重
6. 追加 assistant 气泡
7. 监听 typing 事件展示状态
```

用户发送消息仍然先走 HTTP：

```text
POST /v1/chats/:chatId/messages
```

前端收到 HTTP accepted 后，只确认用户消息已被接收；assistant 消息以 WebSocket 事件为准。

## 12. 数据模型影响

当前 `chat_messages` 可以继续承载消息本体，但建议扩展 `message_metadata` 的使用：

```json
{
  "source": "reply",
  "turnTraceId": "turn_xxx",
  "sequence": 1,
  "delivery": {
    "channel": "websocket"
  }
}
```

主动消息示例：

```json
{
  "source": "proactive",
  "proactiveReason": "idle_opening",
  "triggeredBy": "online_idle",
  "sequence": 1
}
```

后续如果需要更强的可靠投递，可以再加 `realtime_outbox` 表。但第一版只做单进程本地/开发验证时，可以先不加。

## 13. Trace 影响

当前 trace 是单 assistant message 视角，需要演进：

```text
assistantMessageId -> assistantMessageIds[]
```

新增事件：

```text
chat.assistant_message.persisted
chat.realtime.event.emitted
chat.proactive.trigger.evaluated
chat.proactive.message.created
```

一轮多条回复时：

```text
turn_trace_id = turn_xxx
assistantMessageIds = [msg_1, msg_2, msg_3]
```

主动消息时：

```text
turn_trace_id 可以为空，或者使用 proactive_trace_id
source = proactive
reason = idle_opening | followup | continuation
```

建议第一版仍然保持可调试：

- 主动消息也要有 trace
- 多条 assistant message 要能在 viewer 中看到 sequence
- WebSocket emit 失败不能导致消息落库失败

## 14. 渐进落地顺序

### Phase 1: 拆出 Chat Runtime

目标：让 assistant message 生成不再强绑定 HTTP route。

改造点：

- 从 `POST /messages` route 中抽出 `runUserTurn`
- `runUserTurn` 返回 `turnTraceId`、`userMessageId`、`assistantMessages`
- 先保持 HTTP 返回旧格式，避免前端大改
- 内部先允许 `assistantMessages.length >= 1`

### Phase 2: 支持多条 assistant messages

目标：一条用户消息可以产生多条 assistant 气泡。

改造点：

- workflow 输出从单个 reply 改为 message array
- prompt 增加“可分多条短消息回复”的结构化输出约束
- route 按 sequence 逐条落库
- trace 记录 `assistantMessageIds`

### Phase 3: 新增 WebSocket Realtime Gateway

目标：在线页面实时接收 assistant message。

改造点：

- 新增 `WS /v1/realtime`
- 支持 subscribe chatId
- 支持 `chat.message.created`
- 前端连接 WS 并按 `message.id` 去重

### Phase 4: HTTP response 改 accepted 语义

目标：HTTP 只确认用户消息被接收，assistant 消息统一从 WS 来。

响应示例：

```json
{
  "status": "accepted",
  "chatId": "chat_xxx",
  "userMessageId": "msg_xxx",
  "turnTraceId": "turn_xxx"
}
```

### Phase 5: 在线主动消息

目标：用户在线停留时，AI 偶尔主动发言。

改造点：

- presence tracking
- idle timer
- proactive trigger guard
- proactive message runtime
- message 落库后 emit `chat.message.created`

## 15. 风险与约束

### 15.1 不要直接把 HTTP chat 接口替换成 WebSocket

当前 HTTP route 承担了太多可靠写入职责：

- 鉴权/匿名会话
- 限流
- 用户消息落库
- 上下文组装
- trace
- assistant 落库
- 错误返回

直接替换会让连接管理、幂等、重试、状态恢复一次性变复杂。

### 15.2 主动消息不能绕过持久化

所有主动消息都必须先写入 `chat_messages`，再通过 WebSocket 推送。

否则会出现：

- 刷新后消息消失
- 多端状态不一致
- trace 看不到消息来源
- 调试困难

### 15.3 第一版不要做太复杂的主动策略

主动消息最容易造成打扰感。第一版只做在线 idle 场景即可：

```text
用户进入 chat
-> 15s 未发言
-> AI 发一条 opening
-> 本 chat 进入冷却
```

不要一开始做复杂人格 agent 自主规划。

## 16. 推荐结论

当前不应立即重写 chat 主链路。

推荐方向是：

```text
保留 HTTP /v1/chats/:chatId/messages 作为 command path
新增 WebSocket /v1/realtime 作为 online event path
先把后端从 one user message -> one assistant message
演进为 one user turn -> multiple assistant messages
再支持在线 proactive assistant message
```

当前“不做”的核心原因不是 WebSocket 本身难，而是后端工作流仍然是单 reply 模型：

```text
runChatWorkflow -> chatReplySchema -> assistantMessage -> appendChatMessages([assistantMessage]) -> return assistantMessage
```

要支持主动消息和多气泡回复，必须先把后端抽象从“一问一答”升级为“turn runtime + message event delivery”。
