# Nuwa Skill 蒸馏流程分析与借鉴方案

调研对象：[alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill)  
调研日期：2026-04-27  
结论：值得借鉴，但不能照搬为当前产品的运行形态。它适合作为“一键蒸馏”的方法论内核，我们需要把它从 Claude Code Skill 形态改造成可审计、可异步执行、可在 H5 创建流程中使用的后端工作流。

## 1. 这个 skill 的整体定位

`nuwa-skill` 的目标不是生成一个聊天 prompt，而是生成一个“人物思维操作系统”。它强调提炼的是 `HOW they think`，不是复述 `WHAT they said`。

它把一个人物拆成五层：

- 怎么说话：表达 DNA，包括语气、节奏、用词偏好。
- 怎么想：心智模型、认知框架。
- 怎么判断：决策启发式。
- 什么不做：反模式、价值观底线。
- 知道局限：诚实边界。

这个方向和我们当前项目非常匹配。我们之前的 profile 更像 `summary + topicStrengths`，能支撑基础聊天，但不够支撑“像这个人一样思考”。如果要让用户创建出来的人物有长期聊天价值，profile 必须从摘要升级为可运行的人格协议。

## 2. 核心流程拆解

### Phase 0: 入口分流

它先区分两种入口：

- 明确人名或主题：直接进入蒸馏。
- 模糊需求：先诊断用户想解决的问题，再反推候选人物或主题。

可借鉴点：我们当前创建流程只支持用户主动输入人物，不支持“我想要一个能帮我做商业判断的人”。后续可以增加“帮我选一个蒸馏对象”的入口，但 V1 先不做复杂诊断，避免创建流程过重。

### Phase 0A: 需求澄清

它会确认人物是谁、聚焦方向、用途、新建还是更新、是否有本地一手素材。

可借鉴点：我们的一键蒸馏创建页应最少收集：

- 蒸馏对象名称。
- 创建用途：聊天陪伴、决策视角、学习解释、角色扮演。
- 聚焦方向：全面画像或某个维度。
- 用户补充资料：链接、文本、文件。

不建议照搬点：它的交互偏命令行 Agent，追问比较多；我们的 H5 产品要把这些收敛成一页表单和一个“可选补充资料”区域。

### Phase 1: 六路并行采集

它把调研拆成 6 个维度：

- `01-writings.md`：著作、长文、系统性表达。
- `02-conversations.md`：播客、访谈、长对话。
- `03-expression-dna.md`：社媒、短文、表达习惯。
- `04-external-views.md`：他者评价、批评、争议。
- `05-decisions.md`：重大决策、转折点、行动记录。
- `06-timeline.md`：时间线、思想演化、最近动态。

这是最值得借鉴的部分。它避免了“搜几篇百科然后总结”的低质量蒸馏，把资料采集变成结构化证据分桶。

我们应改造成数据库内的 `distill_evidence_buckets` 或 `persona_distill_artifacts`，而不是 markdown 文件：

- `WRITINGS`
- `CONVERSATIONS`
- `EXPRESSION_DNA`
- `EXTERNAL_VIEWS`
- `DECISIONS`
- `TIMELINE`

每个 bucket 保存来源、摘要、证据片段、可信度、一手/二手、时间戳、是否用户提供。

### Phase 1.5: 调研 Review 检查点

它在生成前暂停，展示每个 Agent 的来源数量、关键发现、矛盾点、信息不足维度。

这非常适合我们的产品。用户不应该直接看到最终 prompt，而应该先看到“资料来源确认页”：

- 找到了哪些来源。
- 哪些来源是一手资料。
- 哪些来源存在争议。
- 哪些维度信息不足。
- 用户可以删除来源、补充来源、确认继续。

这能显著提高用户信任，也能降低模型胡编的风险。

### Phase 2: 框架提炼

它的提炼核心是“三重验证”：

- 跨域复现：同一思维框架至少出现在两个不同领域。
- 有生成力：可以推断此人面对新问题时的可能立场。
- 有排他性：不是所有聪明人都会这么想。

这是当前项目最缺的质量门槛。我们不应该把所有资料总结都塞进 profile，而是要筛选出真正能“驱动聊天”的模型。

建议落成 profile schema：

```ts
type PersonaProfileV2 = {
  summary: string;
  mentalModels: Array<{
    name: string;
    description: string;
    evidenceRefs: string[];
    useWhen: string[];
    limitations: string[];
    confidence: "high" | "medium" | "low";
  }>;
  decisionHeuristics: Array<{
    rule: string;
    useWhen: string[];
    exampleRefs: string[];
  }>;
  expressionDna: {
    sentenceStyle: string;
    vocabulary: string[];
    pacing: string;
    humorStyle: string | null;
    certaintyStyle: string;
    bannedPhrases: string[];
  };
  valuesAndAntiPatterns: {
    values: string[];
    antiPatterns: string[];
    tensions: string[];
  };
  honestBoundaries: string[];
  sourceSummary: {
    sourceCount: number;
    primarySourceCount: number;
    researchCutoff: string;
    weakBuckets: string[];
  };
  runtimePrompt: string;
};
```

### Phase 3: Skill 构建

它最终生成 `SKILL.md`，包含角色扮演规则、身份卡、心智模型、决策启发式、表达 DNA、时间线、价值观、边界、来源。

我们不需要生成 Claude Skill 文件。我们需要生成两类产物：

- `profileJson`：结构化、可检索、可版本化。
- `runtimePrompt`：供聊天时注入的精简人格协议。

不建议把完整长文 profile 每次都发给模型。聊天时应按场景压缩：

- 常规聊天：summary + expressionDna + 2-3 个相关 mentalModels。
- 领域问题：相关 mentalModels + decisionHeuristics。
- 事实问题：触发 live search 或 persona evidence retrieval。
- 高风险问题：只保留 values、boundaries 和安全规则。

### Phase 4: 质量验证

它用三类测试验证：

- 已知测试：问公开表态过的问题，看方向是否一致。
- 边缘测试：问未公开讨论但相关的问题，看是否合理不确定。
- 风格测试：看 100 字输出是否有辨识度，不像通用 AI。

这部分应成为我们一键蒸馏的后端质量门禁：

- `known_position_score`
- `edge_uncertainty_score`
- `voice_distinctiveness_score`
- `source_grounding_score`
- `safety_boundary_score`

如果分数不足，不应直接发布为可聊天对象，应进入 `NEEDS_REVIEW` 或让用户补资料。

## 3. 脚本和代码层面的可借鉴点

仓库脚本很轻，不是核心壁垒，但有几个方向可以借鉴：

- `download_subtitles.sh`：用 `yt-dlp` 下载 YouTube 字幕，适合西方人物视频资料。
- `srt_to_transcript.py`：把 SRT/VTT 清洗成 transcript，这个很实用。
- `merge_research.py`：统计 6 个 research 文件的来源数、关键发现、矛盾点，适合改造成我们的调研检查点。
- `quality_check.py`：检查心智模型数量、局限性、表达 DNA、诚实边界、内在张力、一手来源占比，适合改造成后端质量 gate。

但脚本本身不能直接放进线上流程。原因：

- 它们面向本地文件系统和 Claude Code skill 目录。
- 没有任务状态、失败重试、数据库持久化。
- 没有来源去重、URL 归一化、审计记录。
- 没有适配中国视频/音频平台的稳定抓取。

正确做法是吸收脚本逻辑，重写为后端 service。

## 4. Prompt 层面的可借鉴点

最值得吸收的是它的 prompt 结构，不是具体文案。

### 可借鉴

- “心智模型不是语录”的约束。
- 每个模型必须包含证据、应用场景、局限。
- 区分一手、二手、推断。
- 保留矛盾，不强行调和。
- 信息不足时明确降级，而不是编。
- 角色扮演时用第一人称，但不要频繁免责声明。
- Agentic Protocol：遇到需要事实的问题先查事实，再用人格框架回答。

### 需要改造

`nuwa-skill` 的 Agentic Protocol 偏“每个生成出的 skill 自己决定是否 WebSearch”。我们的产品不应该把工具调用交给最终聊天 prompt 自由发挥，而应该由后端统一调度：

- 先由 `planner` 判断是否需要搜索。
- 再由 `tool` 执行搜索或库内 evidence retrieval。
- 最后由 DeepSeek/主模型基于“已筛选资料 + 人格协议”回复。

这样可观测、可控，也方便后续做成本控制和安全审计。

## 5. 对当前项目的一键蒸馏改造建议

### V1 目标

把“输入人物名 -> 自动找资料 -> 用户确认来源 -> 后台蒸馏 -> 生成可聊天人物”跑通。

### V1 工作流

1. `POST /v1/persona-distill-intents`
   - 输入人物名、用途、聚焦方向。
   - 做存在性检查、政治/敏感风险初筛。
   - 返回候选人物和风险状态。

2. `POST /v1/persona-distill-source-discovery`
   - 按 6 个 bucket 搜索资料。
   - 中文人物优先：B站原始视频、小宇宙播客、权威媒体、本人微博/书籍/访谈。
   - 明确排除低质量二手内容。
   - 返回来源列表和 bucket 覆盖情况。

3. 用户确认来源
   - 用户可以删除来源、添加链接、粘贴文本。
   - 系统显示来源质量和缺口。

4. `POST /v1/persona-distill-jobs`
   - 创建异步任务。
   - 执行资料抽取、证据分桶、框架提炼、profile 生成、质量验证。

5. `GET /v1/persona-distill-jobs/:jobId`
   - 查询进度、调研摘要、最终 profile、质量分。

6. 生成 `persona_versions`
   - status 可为 `CANDIDATE` 或 `READY`。
   - 如果质量分达标，允许用户发布或直接创建聊天。

### V1 暂不做

- 不做 Claude Skill 文件导出。
- 不做完整多 Agent 并行框架，先用单 job 内部按 bucket 串并结合并行。
- 不做复杂的“模糊需求推荐人物”，先聚焦明确人物创建。
- 不做本地大规模 RAG，只保存 evidence 和 profile，聊天时按需检索。

## 6. 与我们之前方案的关系

之前的一键蒸馏计划方向是对的，但 profile 结构太薄。`nuwa-skill` 给我们的补充是：

- 增加 6 个 evidence bucket。
- 增加三重验证，避免把普通观点升格为人格模型。
- 增加表达 DNA 的结构化字段。
- 增加诚实边界和信息不足标注。
- 增加质量验证 gate。
- 增加调研 review 检查点。

Minimax live search 仍然有价值，但它应该作为“资料发现 / 聊天时事实更新”的工具，不应该替代 profile 生成。真正的人格核心应该来自一次完整蒸馏，而不是每轮临时搜索。

## 7. 风险和边界

- 活人蒸馏有名誉和误导风险：必须明确“基于公开资料的风格化推断，非本人观点”。
- 争议人物容易生成危险建议：必须把“反模式”和“安全边界”写入 profile，并在聊天时生效。
- 资料搜索质量决定上限：来源不足时宁可生成低置信 profile，不要强行发布。
- 中国环境需要政治风险前置筛查：敏感人物、现实政治人物、公共政策相关人物不应进入普通用户创建流。
- 虚拟人物需要区分“作品设定”和“现实建议”：可以风格化，但不能把虚构世界规则迁移成现实行为建议。

## 8. 准备怎么做

建议下一步不是直接写聊天功能，而是先升级一键蒸馏设计文档和数据结构。

执行顺序：

1. 更新 `docs/one-click-persona-distill-design-2026-04-25.md`，加入 Nuwa 借鉴版流程。
2. 设计 `PersonaProfileV2` schema。
3. 设计 `persona_distill_jobs` 和 `persona_distill_artifacts` 表。
4. 设计 source discovery 的 6 bucket 输出协议。
5. 设计 distill job 的状态机和质量分。
6. 再实现后端接口。
7. 最后改 H5 创建流程。

落地判断：强烈建议吸收 `nuwa-skill` 的方法论，不建议照搬它的文件结构和 Claude Skill 产物形态。我们的产品需要的是“Nuwa 式蒸馏内核 + SaaS 化后端工作流 + H5 来源确认体验”。

