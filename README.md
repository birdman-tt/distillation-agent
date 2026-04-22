# Hall of Fame Miniapp

## 当前状态

当前仓库已经进入实现阶段，已完成第一轮工程初始化：

- monorepo workspace 骨架
- `apps/api`、`apps/worker`、`apps/client`
- `packages/contracts`、`packages/domain`、`packages/api-client`
- `PostgreSQL`、`Redis`、`MinIO` 本地基础设施配置
- 初版数据库 schema、domain enums、zod contracts

## 资料索引

- [产品设计](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/product-design.md)
- [产品规格](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/product-specification.md)
- [设计系统规范](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/design-system-specification.md)
- [技术方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/technical-architecture.md)
- [项目架构蓝图](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/Project_Architecture_Blueprint.md)
- [实施计划](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/implementation-plan.md)
- [部署架构方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/deployment-architecture.md)
- [平台无关部署基线](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/platform-neutral-deployment-baseline.md)
- [统一 Docker 部署方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/unified-docker-deployment-plan.md)
- [腾讯云部署方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/tencent-cloud-deployment-plan.md)

## 已确定的关键决策

- 产品不是私密分身，也不是数字复活
- V1 只做公开人格蒸馏平台
- 前端使用一套 `Taro + React + TypeScript` 代码，同时覆盖 `H5` 和 `微信小程序`
- 后端是一套统一 API，只有登录入口按平台分叉
- LLM runtime 采用内嵌式 `Mastra workflow`，主生产链路不使用 `agent`
- 单供应商选择 `DeepSeek`
- 蒸馏使用 `deepseek-reasoner`，在线对话使用 `deepseek-chat`
- 分享同时覆盖微信内传播和网页传播
- 分享身份绑定 `persona_version`，不是可变中的裸对象
- 蒸馏不做 fine-tune，采用 `结构化画像 + RAG + 输出约束`
- V1 检索先采用本地全文检索与 metadata filter，不依赖额外 embedding API
- 公开网页资料允许半自动抓取，但必须经过人工审核后才能进入正式蒸馏
- 允许风格化推演，但资料不足、资料冲突、越界问题必须降级或拒答

## 下一步建议

从这里往下，建议直接按实施计划推进，不再回到产品大方向层面反复讨论：

1. 完成 API route/service 骨架
2. 接入数据库迁移和本地启动链路
3. 实现官方人物馆最小闭环
4. 继续推进蒸馏 workflow 与聊天 runtime

## 本地开发

推荐命令：

```bash
pnpm install
pnpm infra:up
pnpm dev:all
pnpm dev:api
pnpm dev:worker
pnpm dev:client:h5
pnpm dev:client:weapp
```

数据库运行方式：

- 如果你本地仍然跑 `infra/docker-compose.yml` 里的 Postgres，就直接填 `DATABASE_URL`
- 如果你已经切到 Supabase Session Pooler，可以保留默认占位 `DATABASE_URL`，只填写 `POSTGRES_PASSWORD`
- API 会在启动时优先使用显式 `DATABASE_URL`；如果它还是本地占位值且存在 `POSTGRES_PASSWORD`，会自动拼出当前项目的 Supabase Session Pooler 连接串

Node 版本锁定为 `22`，`pnpm` 主版本锁定为 `10`。当前如果本机版本低于该约束，安装和 typecheck 仍可能通过，但不作为长期开发基线。

如果你只想在本地一次性拉起 `worker + api + h5`，直接运行：

```bash
pnpm dev:all
```

脚本位置在 [`scripts/dev-all.sh`](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/scripts/dev-all.sh)，会自动尝试 `nvm use`，并在 `Ctrl+C` 时一起关闭三个进程。

## 部署初版

统一 Docker 部署初版文件位于 [`infra/deploy`](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/infra/deploy)。

最小使用方式：

```bash
cp infra/deploy/.env.example.staging infra/deploy/.env.staging
pnpm docker:build:api
pnpm docker:build:worker
pnpm docker:build:h5
pnpm docker:build:migrate
pnpm deploy:config:staging
pnpm deploy:migrate:staging
pnpm deploy:up:staging
```

本机用 Docker 直接访问服务：

```bash
cp infra/deploy/.env.example.local infra/deploy/.env.local
pnpm docker:build:api
pnpm docker:build:worker
pnpm docker:build:h5
pnpm docker:build:migrate
pnpm deploy:up:local
```

启动后可访问：

- `http://localhost:8080`：H5 网关入口
- `http://api.localhost:8080/health`：API 网关入口
- `http://localhost:13100/health`：H5 直连
- `http://localhost:13000/health`：API 直连
- `http://localhost:13001/health`：Worker 直连
