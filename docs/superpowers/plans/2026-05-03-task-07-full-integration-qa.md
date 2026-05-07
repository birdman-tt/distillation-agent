# Full Integration QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证并修复“创建对象 -> 我的对象 -> 对象详情 -> 纯聊天/管理操作 -> 补资料/删除/兼容旧链接”的完整用户闭环。

**Architecture:** 本任务不新增产品范围，只做端到端联调和必要修复。测试顺序先跑静态和集成测试，再启动本地服务做浏览器路径验证；发现问题时先补最小回归测试，再修对应前端/API/worker 代码，最后交给 Kant 复审。

**Tech Stack:** TypeScript, Fastify, Supabase/PostgreSQL, pnpm workspace, H5 local app, Codex in-app browser.

---

## 1. 业务验收原则

用户侧必须保持简单：

- 不展示 `qualityScores`、coverage、style、grounding、risk score。
- 不展示 tool trace、planner/model 名称、runtime state、prompt。
- 创建完成后用户能找到对象。
- 聊天页只保留聊天必要信息，不混入管理信息。
- 管理动作只在 `我的 -> 我的对象 -> 对象详情`。
- 失败、资料不足、删除、旧 preview 链接都要转成用户能理解的状态。

## 2. 文件范围

只在发现问题时修改：

- Frontend: `apps/client/src/h5-app.ts`
- Frontend tests: `apps/client/src/dev-h5.test.ts`, `apps/client/src/chat-behavior.test.ts`
- API contracts: `packages/contracts/src/persona-distill.ts`, `packages/contracts/src/my-objects.ts`, `packages/contracts/src/persona-inventory.ts`
- API routes/repositories: `apps/api/src/routes/persona-distill.ts`, `apps/api/src/routes/my-objects.ts`, `apps/api/src/routes/me.ts`, `apps/api/src/db/repositories/persona-distill-repository.ts`
- Worker: `apps/worker/src/jobs/persona-distill/run-persona-distill-jobs.ts`, `apps/worker/src/jobs/persona-distill/tool-runtime/*`
- API tests: `apps/api/src/persona-distill-v2.test.ts`

不修改：

- 不新增 admin review 页面。
- 不改首页推荐对象策略。
- 不把用户自建对象混入首页。
- 不向用户暴露调试字段。

## 3. Task 7.1: Automated Regression Gate

**目标：** 先确认当前代码的自动化测试基线是否稳定。

**命令：**

- [ ] 跑 contracts typecheck。

```bash
pnpm --filter @hall-of-fame/contracts typecheck
```

Expected: exit code 0.

- [ ] 跑 api typecheck。

```bash
pnpm --filter @hall-of-fame/api typecheck
```

Expected: exit code 0.

- [ ] 跑 api-client typecheck。

```bash
pnpm --filter @hall-of-fame/api-client typecheck
```

Expected: exit code 0.

- [ ] 跑 worker typecheck。

```bash
pnpm --filter @hall-of-fame/worker typecheck
```

Expected: exit code 0.

- [ ] 跑 client typecheck。

```bash
pnpm --filter @hall-of-fame/client typecheck
```

Expected: exit code 0.

- [ ] 跑 worker runtime focused tests。

```bash
node --import tsx --test \
  packages/contracts/src/distill-tools.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/distill-planner.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-loop.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts
```

Expected: all tests pass. This command uses `.env.local` only if the DB-backed `tool-run-store.test.ts` requires it; if it fails because env is missing, rerun with:

```bash
set -a; source .env.local; set +a; node --import tsx --test \
  packages/contracts/src/distill-tools.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/state-machine.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/distill-planner.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-loop.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-registry.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/trace-sanitizer.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/tool-run-store.test.ts \
  apps/worker/src/jobs/persona-distill/tool-runtime/runtime-executor.test.ts
```

- [ ] 跑 API focused integration tests。不要并行跑这些命令，因为它们会 reset 同一 Supabase 测试库。

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "one-click distill job produces" src/persona-distill-v2.test.ts
```

Expected: pass.

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "worker marks low quality" src/persona-distill-v2.test.ts
```

Expected: pass.

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "adding sources to a completed job" src/persona-distill-v2.test.ts
```

Expected: pass.

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test --test-name-pattern "creating the same active distill job is idempotent" src/persona-distill-v2.test.ts
```

Expected: pass.

- [ ] 跑 client tests。

```bash
pnpm --filter @hall-of-fame/client test
```

Expected: exit code 0.

## 4. Task 7.2: Local Service Boot

**目标：** 确认本地服务能用当前 Supabase 配置启动。

**步骤：**

- [ ] 检查端口 3000/3001/3100 是否已被旧进程占用。

```bash
lsof -ti tcp:3000 tcp:3001 tcp:3100
```

Expected: no output. If there is output, stop only the old dev process that belongs to this project before boot.

- [ ] 启动服务。

```bash
set -a; source .env.local; set +a; pnpm dev:all
```

Expected:

```text
H5: http://127.0.0.1:3100
API: http://127.0.0.1:3000
Worker: http://127.0.0.1:3001
```

- [ ] 如果 `pnpm dev:all` 因端口占用失败，只停止本项目旧 dev 进程，不使用 `killall` 或系统级破坏性命令。

## 5. Task 7.3: Browser Product Path QA

**目标：** 用浏览器验证用户真实路径，不看内部接口细节。

**路径 A：创建到对象详情**

- [ ] 打开 `http://127.0.0.1:3100/create`。
- [ ] 输入测试对象：`纪晓岚`。
- [ ] 进入资料确认阶段。
- [ ] 选择推荐资料，必要时添加一条用户补充资料。
- [ ] 开始生成。
- [ ] 生成完成后应进入 `/profile/objects/:objectId` 或给出可进入对象详情的明确入口。
- [ ] 页面不能出现 `qualityScores`、coverage、style、grounding、risk score、tool、trace、planner、runtime、prompt。

**路径 B：我的对象列表和对象详情**

- [ ] 打开 `http://127.0.0.1:3100/profile`。
- [ ] 确认页面只展示少量入口，包含 `我的对象` 和 `聊天记录`。
- [ ] 进入 `/profile/objects`。
- [ ] 确认列表卡片只展示名称、简介、用户状态、主操作。
- [ ] 进入刚创建对象详情。
- [ ] 确认详情页有聊天、编辑、确认使用、补资料、删除、分享中的可用操作。
- [ ] 详情页不能展示内部评分、证据覆盖、prompt 或 worker trace。

**路径 C：确认使用和纯聊天**

- [ ] 在对象详情点击确认使用或开始使用。
- [ ] 进入自建对象聊天。
- [ ] 发送一句：`你怎么看官场里的圆滑和原则？`
- [ ] 确认聊天页没有底部全局导航、没有管理操作、没有质量信息。
- [ ] 确认顶部只显示对象名和必要输入状态。
- [ ] 新消息发送后滚动到底部。

**路径 D：聊天记录恢复**

- [ ] 打开 `/history`。
- [ ] 找到刚才聊天。
- [ ] 点击进入。
- [ ] 应恢复到纯聊天页，不跳到对象管理页或 preview 管理页。

**路径 E：补资料**

- [ ] 从对象详情点击补资料。
- [ ] 应进入 `/create?objectId=...&jobId=...&mode=addSources` 或等价补资料流程。
- [ ] 补资料流程只说明下一步要做什么，不展示 tool/runtime/评分。
- [ ] 补资料提交后仍复用同一个 `objectId`。

**路径 F：删除**

- [ ] 从对象详情触发删除。
- [ ] 删除后对象不再出现在 `/profile/objects`。
- [ ] 如果从 `/history` 进入旧会话，能看到旧消息，但不能继续用已删除对象开启新聊。

**路径 G：preview 兼容**

- [ ] 打开一个旧 `/preview/:personaVersionId` 链接。
- [ ] owner 应重定向到对象详情或纯聊天入口。
- [ ] 非 owner 不应看到内部管理信息。
- [ ] 页面不能展示 quality/publish gate/tool trace/prompt。

**路径 H：编辑与公开/分享**

- [ ] 从对象详情进入编辑。
- [ ] 修改对象名称或简介，例如把简介改为：`铁齿铜牙，机锋里带分寸。`
- [ ] 保存后刷新页面。
- [ ] 对象详情和 `/profile/objects` 列表都应保留新文案。
- [ ] 从对象详情触发公开或分享。
- [ ] 成功后页面只展示用户可用入口，例如分享链接、分享路径或复制按钮。
- [ ] 页面不能展示 share id、version id、publishGate、quality score、coverage、tool trace、prompt。
- [ ] 公开/分享失败时只显示用户语言，例如 `暂时不能公开，可以先自己使用`，不能展示内部 gate reasons。

## 6. Task 7.4: Bug Fix Protocol

**目标：** 如果 QA 发现问题，修复方式必须收敛，避免再次扩大产品。

每个 bug 按以下顺序处理：

- [ ] 记录复现路径、当前结果、期望结果。
- [ ] 判断归属：

```text
UI 文案/跳转/隐藏字段 -> apps/client/src/h5-app.ts
API 返回字段/状态映射 -> apps/api/src/routes/* 或 apps/api/src/db/repositories/persona-distill-repository.ts
worker 终态/trace/状态机 -> apps/worker/src/jobs/persona-distill/*
contract parse/type mismatch -> packages/contracts/src/*
```

- [ ] 先补一个最小回归测试：

```bash
pnpm --filter @hall-of-fame/client test
```

或：

```bash
set -a; source .env.local; set +a; cd apps/api && node --import tsx --test src/persona-distill-v2.test.ts
```

- [ ] 用最小代码修复，不新增无关 UI、状态、字段或页面。
- [ ] 重跑对应测试和 typecheck。
- [ ] 重新浏览器验证同一路径。

## 7. Task 7.5: Final Review Gate

**目标：** 所有自动化和浏览器路径通过后，让 Kant 做最终验收。

交给 Kant 的材料必须包含：

- 实际执行过的命令和结果。
- 浏览器验证路径和结果。
- 如果有修复，列出文件和原因。
- 明确说明用户侧没有暴露内部信息。
- 明确说明 worker 第 7/8 步重构没有破坏创建闭环。

Kant review 必须检查：

- 是否符合 `AGENTS.md` 的“只展示有用信息”。
- 是否符合一键蒸馏当前产品方向。
- 是否存在前端和后端状态不一致。
- 是否存在用户 API 泄漏内部字段。
- 是否存在模型越权决定 DB/终态/用户文案。

## 8. 通过标准

- 所有列出的 typecheck 和 focused tests 通过。
- 浏览器完成 create -> objects -> detail -> confirm -> chat -> history -> add sources -> delete -> preview compatibility。
- 普通用户页面和 API 不展示内部评分、模型、trace、prompt。
- 自建对象聊天和内置对象聊天保持同类纯聊天体验。
- 发现的问题都有对应回归测试或明确的浏览器复验记录。

## 9. QA 修复记录

执行 Task 7 时发现并补齐以下落地问题：

- 对象编辑保存会触发 `PATCH` CORS preflight，本地 API 原本未显式允许 `PATCH/DELETE`。已补 CORS 方法白名单，并增加 API 回归测试。
- 旧 `/preview/:personaVersionId` 仍是复杂预览/发布页，和“我的对象”闭环冲突。已改为兼容跳转页：owner 跳到 `/profile/objects/:objectId`，公开对象跳公开入口，否则只给补资料或返回我的对象入口。
- 删除对象后，历史列表会退回旧 preview 链接，导致旧消息不能回看。已新增 `/history/:chatId` 只读记录页；删除后的旧会话只展示历史消息，不展示输入框，不允许继续发送。
- 聊天详情、发消息和 realtime 订阅原本只按 `chatId` 读取，存在跨用户读取风险，也会让已删除对象的草稿会话继续写入。已补 actor 必填、owner 校验、删除对象会话只读限制，并增加非 owner 读写 404、删除后写入 409 的 API 回归测试。
- 历史列表原本只按 `persona_id` 把草稿聊天映射回我的对象。对象补资料或重蒸后 active version 变化时，旧会话会误进入可输入聊天页。已改为只有 `active_persona_version_id = chat.target_persona_version_id` 且对象 READY/PUBLIC 时才返回 `ownedObjectId`，旧版本会话走 `/history/:chatId` 只读页，并增加换版后只读的 API 回归测试。
- 浏览器默认请求 `/favicon.ico` 会产生 404 控制台噪音。已补 204 路由，避免 QA 误判。
- API 集成测试和本地 dev worker 共用 Supabase 时，dev worker 可能抢占测试 job。最终验收时应先停止本项目 3001 上的 dev worker，再跑 API focused tests；测试完成后再启动 worker。
