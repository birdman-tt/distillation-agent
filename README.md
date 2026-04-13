# Hall of Fame Miniapp 项目资料

## 项目目录

当前项目资料已整理到：

`/Users/wentao.yu/Documents/code/hall-of-fame-miniapp`

## 当前结论

当前方案已经完成两轮收敛：

- 产品方向已定：`公开人格蒸馏平台`
- 技术方向已定：`单后端 + 双端前端 target + 结构化蒸馏流水线`

当前没有新的阻塞性架构问题，后续工作可以直接进入详细设计与实现拆解。

## 资料索引

- [产品设计](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/product-design.md)
- [技术方案](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/technical-architecture.md)
- [实施计划](/Users/wentao.yu/Documents/code/hall-of-fame-miniapp/docs/implementation-plan.md)

## 已确定的关键决策

- 产品不是私密分身，也不是数字复活
- V1 只做公开人格蒸馏平台
- 前端使用一套 `Taro + React + TypeScript` 代码，同时覆盖 `H5` 和 `微信小程序`
- 后端是一套统一 API，只有登录入口按平台分叉
- LLM runtime 采用内嵌式 `Mastra workflow`，主生产链路不使用 `agent`
- 分享同时覆盖微信内传播和网页传播
- 分享身份绑定 `persona_version`，不是可变中的裸对象
- 蒸馏不做 fine-tune，采用 `结构化画像 + RAG + 输出约束`
- 公开网页资料允许半自动抓取，但必须经过人工审核后才能进入正式蒸馏
- 允许风格化推演，但资料不足、资料冲突、越界问题必须降级或拒答

## 下一步建议

从这里往下，建议只做以下三类文档，不再回到产品大方向层面反复讨论：

1. 数据库表结构设计
2. API contracts 与状态机定义
3. 审核能力、版本状态机和 URL 导入安全边界设计
4. 按实施计划进入实际开发

## 切换路径前备注

- 当前 `/Users/wentao.yu/Documents/code/hall-of-fame-miniapp` 还是资料归档目录，不是已经搭好脚手架的工程目录
- 现有文档是从 `/Users/wentao.yu/Documents/New project/docs/projects/hall-of-fame` 同步过来的，旧位置仍保留副本
- 如果后续决定正式在这个目录开工，第一步应该是初始化项目结构，而不是继续补方案文档
- 推荐进入新路径后的起手顺序：
  1. 初始化 git 仓库或决定是否挂到现有 monorepo
  2. 建立 `apps/api`、`apps/worker`、`apps/client`、`packages/*`
  3. 启动本地基础设施：`PostgreSQL`、`Redis`、`MinIO`
  4. 开始数据库表设计和 API contracts
