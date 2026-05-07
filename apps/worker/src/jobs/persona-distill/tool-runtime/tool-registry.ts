import {
  distillToolCallSchema,
  distillToolNameSchema,
  distillToolResultSchema,
  type DistillRuntimeState,
  type DistillToolName,
  type DistillToolResult,
} from "@hall-of-fame/contracts";

import { getNextRuntimeStateForTool } from "./state-machine.js";

export type DistillToolContext = {
  jobId: string;
  actorUserId: string;
  personaId: string;
  runtimeState: DistillRuntimeState;
  allowSystemFailure?: boolean;
};

export type DistillToolHandler = {
  toolName: DistillToolName;
  execute(input: unknown, context: DistillToolContext): Promise<DistillToolResult>;
};

const buildSummary = (toolName: DistillToolName) => {
  switch (toolName) {
    case "check_distill_intent_risk":
      return "风险判断已完成。";
    case "search_sources":
      return "资料候选已收集。";
    case "clean_sources":
      return "资料已清洗。";
    case "extract_evidence":
      return "证据已抽取。";
    case "score_source_coverage":
      return "资料覆盖已评分。";
    case "generate_persona_profile":
      return "人物 profile 已生成。";
    case "validate_persona_profile":
      return "人物 profile 已校验。";
    case "persist_persona_candidate":
      return "候选对象已保存。";
    case "mark_job_needs_sources":
      return "任务已标记为需要补充资料。";
    case "mark_job_failed":
      return "任务已标记为失败。";
  }
};

const buildPlaceholderHandler = (toolName: DistillToolName): DistillToolHandler => ({
  toolName,
  async execute(input, context) {
    const call = distillToolCallSchema.parse({ toolName, input });
    const stateAfter = getNextRuntimeStateForTool(context.runtimeState, toolName);
    return distillToolResultSchema.parse({
      ok: true,
      stateAfter,
      summary: buildSummary(toolName),
      data: {
        toolName: call.toolName,
        placeholder: true,
      },
    });
  },
});

export const buildDistillToolRegistry = () =>
  new Map<DistillToolName, DistillToolHandler>(
    distillToolNameSchema.options.map((toolName) => [toolName, buildPlaceholderHandler(toolName)]),
  );

export const getDistillToolHandler = (toolName: string) => {
  const parsed = distillToolNameSchema.safeParse(toolName);
  if (!parsed.success) {
    return null;
  }
  return buildDistillToolRegistry().get(parsed.data) ?? null;
};
