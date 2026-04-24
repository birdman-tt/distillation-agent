# Chat Trace Viewer

本地 `Chat Trace Viewer` 是一个只用于开发调试的独立页面。

- 不接入正式 H5 前端
- 不需要单独构建
- 页面资产由 `apps/api` 通过内部路由直接返回
- 页面只消费现有 trace JSON 接口，不引入额外协议

## 目录

- 页面模板：[index.html](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/tools/chat-trace-viewer/index.html)
- 样式：[viewer.css](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/tools/chat-trace-viewer/viewer.css)
- 交互脚本：[viewer.js](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/tools/chat-trace-viewer/viewer.js)
- API 路由：[chat-traces.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/routes/internal/chat-traces.ts)

## 启动

先启动 API：

```bash
pnpm --filter @hall-of-fame/api exec tsx src/server.ts
```

也可以使用你平时的 API 启动方式，例如：

```bash
pnpm dev:api
```

默认端口是 `3000`，可由 `APP_PORT` 覆盖。

## 访问入口

页面入口：

```text
GET /internal/debug/chat-traces/viewer
```

完整地址示例：

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer
```

页面使用的 JSON 接口：

- `GET /internal/debug/chat-traces/:turnTraceId`
- `GET /internal/debug/chat-traces?chatId=...`

## 常用打开方式

### 1. 直接打开 viewer

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer
```

适合手动输入 `turnTraceId` 或 `chatId`。

### 2. 带 `turnTraceId` 直达单条 trace

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer?turnTraceId=<turnTraceId>
```

页面会直接请求：

```text
GET /internal/debug/chat-traces/:turnTraceId
```

### 3. 带 `chatId` 查看多轮 trace

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer?chatId=<chatId>
```

页面会先请求：

```text
GET /internal/debug/chat-traces?chatId=<chatId>
```

然后自动选中最新一条 trace，再请求详情。

## Token 用法

如果配置了：

```bash
CHAT_TRACE_INTERNAL_TOKEN=your-token
```

那么：

- `viewer` HTML 页面仍然可以打开
- 但 JSON 接口会校验请求头 `x-internal-debug-key`

viewer 的约定是通过 query 参数注入 token：

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer?turnTraceId=<turnTraceId>&token=<your-token>
```

或者：

```text
http://127.0.0.1:3000/internal/debug/chat-traces/viewer?chatId=<chatId>&token=<your-token>
```

页面脚本会自动把它带到后续 `fetch` 请求里。

## 如何拿到 `turnTraceId`

最直接的方式有两种：

- 对话请求 `POST /v1/chats/:chatId/messages` 的响应头 `x-turn-trace-id`
- 已知 `chatId` 时，通过 `GET /internal/debug/chat-traces?chatId=...` 先拉列表

推荐开发时直接从浏览器 Network 面板复制 `x-turn-trace-id`，再拼到 viewer URL 里。

## 页面能看什么

### Trace List

当通过 `chatId` 查询时，左侧会显示 trace 列表：

- `turnTraceId`
- `status`
- `startedAt`
- `totalDurationMs`

点击任意一条会切换详情。

### Summary

顶部摘要区会展示：

- `turnTraceId`
- `status`
- `chatId`
- `personaVersionId`
- `fallbackUsed`
- `captureLevel`
- `startedAt`
- `completedAt`
- `totalDurationMs`
- `eventCount`

### Events

waterfall 事件区会展示每个事件的：

- `eventName`
- `stage`
- `status`
- `at`
- `durationMs`
- `fields`

### Artifacts

artifact 区默认按优先级排序，重点看这些 key：

- `system_prompt`
- `user_prompt`
- `chat_context`
- `classification_snapshot`
- `raw_model_response`
- `normalized_model_response`
- `final_assistant_message`

前几个 artifact 默认展开，其他默认折叠。

## 环境开关

相关环境变量定义见：

- [.env.example.hall-of-fame](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.env.example.hall-of-fame)
- [config.ts](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/apps/api/src/observability/chat-trace/config.ts)

关键变量：

```bash
CHAT_TRACE_INTERNAL_ENABLED=true
CHAT_TRACE_INTERNAL_TOKEN=
CHAT_TRACE_CAPTURE_LEVEL=full
```

说明：

- `CHAT_TRACE_INTERNAL_ENABLED=false` 时，viewer 页面和 JSON 接口都会返回 `404`
- `CHAT_TRACE_INTERNAL_TOKEN` 为空时，本地默认不需要 token
- `CHAT_TRACE_CAPTURE_LEVEL` 决定 trace 采集粒度，但不影响 viewer 是否能打开

## 常见问题

### 1. 页面返回 `404`

通常是：

- API 没启动
- 路径不对
- `CHAT_TRACE_INTERNAL_ENABLED=false`

先确认：

```bash
curl http://127.0.0.1:3000/health
```

### 2. 页面能打开，但详情显示 `403`

这表示 viewer HTML 可访问，但 JSON 接口被 token 保护了。

处理方式：

- 检查 `CHAT_TRACE_INTERNAL_TOKEN`
- 用 `?token=<your-token>` 打开 viewer

### 3. `chatId` 查询为空

说明这个 chat 目前没有落 trace，或者 `chatId` 填错了。

建议先确认：

- 该 chat 是否真的发过消息
- 对话请求响应头里是否返回了 `x-turn-trace-id`

### 4. 页面里只有一条 `favicon.ico 404`

这个可以忽略，不影响 viewer 功能。

## 修改约束

后续维护这个工具时，尽量保持这些边界不变：

- 仍然是独立静态资产，不接入正式业务前端
- 不引入构建链和前端依赖
- 不新增 viewer 专用后端协议，优先复用已有 JSON trace 接口
- 只服务本地和内部调试，不当作正式产品页面扩展
