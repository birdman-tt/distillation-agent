# 蒸馏可观测日志实施方案

生成日期：2026-05-03

## 目标

让一键蒸馏 job 的每一步可追踪、可查询、可排障：

- Worker 控制台能看到结构化 job / tool 日志。
- API 能按 job 查询持久化 trace。
- H5 创建页在调试模式下能看到简洁日志面板。
- 工具输入输出可见，但必须脱敏、截断。
- 普通用户默认不看到内部 tool、模型、prompt、质量分。

这套方案解决“蒸馏流程不可见”的问题，不直接解决“占位资料误用”。占位资料误用需要后续单独做资料质量 gate。

## 现状

当前系统已经有持久化 tool trace：

- `persona_distill_tool_runs` 保存 `seq`、`tool_name`、`runtime_state_before`、`runtime_state_after`、`input_json`、`output_json`、`status`、`error_message`、`started_at`、`finished_at`。
- `apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.ts` 会对 tool input/output 做脱敏。
- `persona_distill_artifacts` 保存候选版本等阶段产物。
- Worker 使用 Fastify pino 日志，但蒸馏 tool loop 没有完整结构化日志。
- `GET /v1/persona-distill-jobs/:jobId` 只返回 job 概览，不返回 trace。

## 最终方案

### 1. Worker 结构化日志

新增轻量日志工具，复用现有 pino 输出风格，但不让日志失败影响 job。

日志事件：

- `persona_distill.job.claimed`
- `persona_distill.job.started`
- `persona_distill.job.completed`
- `persona_distill.job.failed`
- `persona_distill.job.progress_updated`
- `persona_distill.planner.tool_rejected`
- `persona_distill.tool.started`
- `persona_distill.tool.finished`
- `persona_distill.tool.rejected`
- `persona_distill.artifact.persisted`

每条日志统一包含：

- `kind`
- `jobId`
- `personaId`
- `actorUserId`
- `seq`
- `toolName`
- `runtimeStateBefore`
- `runtimeStateAfter`
- `status`
- `durationMs`
- `input`
- `output`
- `errorMessage`

`input/output/artifact` 必须使用同一套 sanitizer 后再输出。

### 2. Trace API

新增接口：

```http
GET /v1/persona-distill-jobs/:jobId/trace
```

访问规则：

- 仅 job owner 可访问。
- production 默认关闭。
- 本地/非生产默认可用。
- 可用 `PERSONA_DISTILL_TRACE_API_ENABLED=true|false` 强制控制。

返回内容：

- `jobId`
- `status`
- `currentStep`
- `progress`
- `events`
- `runs`
- `artifacts`

`events` 由现有表组合出来，不新增 DB 表：

- job 创建
- job claimed
- tool start / finish / reject
- artifact created
- job terminal

`runs` 返回每个 tool run 的输入输出、状态、耗时。

`artifacts` 返回脱敏后的 artifact。不能原样返回 `artifact_json`。

### 3. H5 调试日志面板

创建页只在调试模式显示日志：

- URL 包含 `debug=distill`
- 或 `localStorage.hof-distill-debug=true`

默认普通用户不显示。

面板规则：

- 标题：`调试日志 / 蒸馏流程`
- 面板只在调试模式显示。
- 每条工具记录默认折叠。
- 列表先展示 job/tool/artifact 时间线，再展示可展开的工具调用。
- 工具调用展示：序号、工具名、状态、耗时。
- 每步可展开查看 `input/output` JSON。
- JSON 必须 HTML escape，并限制长度，避免大 JSON 破坏页面。

### 4. 测试

API：

- owner 可获取 trace。
- 非 owner 获取 404。
- trace API 关闭时返回 404。
- `RUNNING / SUCCEEDED / FAILED / REJECTED` run 排序和 `durationMs` 正确。
- artifact 经过脱敏，不返回敏感字段原文。

Worker：

- tool run start/finish/rejected 会输出结构化日志。
- 日志异常不影响 tool run DB 写入。
- input/output 日志使用 sanitizer。

H5：

- create 页默认不请求 `/trace`。
- `debug=distill` 时请求 `/trace`。
- 默认 HTML 不直接展示内部日志面板。
- debug 面板使用折叠 JSON，不影响普通创建流程。

## 实施顺序

1. 新增 API trace schema、repository 查询和 route。
2. 新增 worker distill logger，并接入 tool-run-store、job claim/progress/finish。
3. 新增 H5 debug panel。
4. 补测试并运行 typecheck。
5. 用现有 job 手动验收：控制台日志、API trace、H5 debug 面板三处都能看到同一条链路。

## 不做

- 不新增 DB 表。
- 不把日志默认暴露给普通用户。
- 不在本次修复占位资料质量问题。
- 不记录原始全文、token、authorization、HTML、raw response。
