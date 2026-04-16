# Hall of Fame Miniapp

## 当前状态

当前仓库已经进入实现阶段，已完成第一轮工程初始化：

- monorepo workspace 骨架
- `apps/api`、`apps/worker`、`apps/client`
- `packages/contracts`、`packages/domain`、`packages/api-client`
- `PostgreSQL`、`Redis`、`MinIO` 本地基础设施配置
- 初版数据库 schema、domain enums、zod contracts

## 资料索引

- [产品设计](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/product-design.md)
- [产品规格](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/product-specification.md)
- [设计系统规范](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/design-system-specification.md)
- [技术方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/technical-architecture.md)
- [项目架构蓝图](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/Project_Architecture_Blueprint.md)
- [实施计划](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/.worktrees/task1-bootstrap/docs/implementation-plan.md)

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
pnpm dev:api
pnpm dev:worker
pnpm dev:client:h5
pnpm dev:client:weapp
```

Node 版本锁定为 `22`，`pnpm` 主版本锁定为 `10`。当前如果本机版本低于该约束，安装和 typecheck 仍可能通过，但不作为长期开发基线。
