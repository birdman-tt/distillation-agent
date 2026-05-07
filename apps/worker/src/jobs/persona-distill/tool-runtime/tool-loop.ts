import {
  distillToolCallSchema,
  type DistillRuntimeState,
  type DistillToolCall,
  type DistillToolName,
} from "@hall-of-fame/contracts";

import type {
  DistillPlanner,
  DistillPlannerInput,
  DistillPlannerJobContext,
  DistillToolMemorySnapshot,
} from "./distill-planner.js";
import { DistillPlannerToolCallParseError } from "./distill-planner.js";
import { executeDistillToolStep } from "./runtime-executor.js";
import { isTerminalDistillRuntimeState } from "./state-machine.js";
import type { DistillToolContext, DistillToolHandler } from "./tool-registry.js";
import { buildDistillToolRunStore } from "./tool-run-store.js";
import { logDistillEvent, type DistillLogger } from "../distill-logger.js";

type DistillToolRunStore = ReturnType<typeof buildDistillToolRunStore>;

export type DistillToolLoopStatus = "succeeded" | "needs_more_sources" | "failed";

export type DistillToolLoopResult = {
  runtimeState: DistillRuntimeState;
  status: DistillToolLoopStatus;
  toolResults: DistillPlannerInput["toolResults"];
};

const mapTerminalStateToStatus = (state: DistillRuntimeState): DistillToolLoopStatus => {
  if (state === "PERSISTED") {
    return "succeeded";
  }
  if (state === "NEEDS_SOURCES") {
    return "needs_more_sources";
  }
  return "failed";
};

const buildFailedCall = (message: string): DistillToolCall =>
  distillToolCallSchema.parse({
    toolName: "mark_job_failed",
    input: {
      code: "DISTILL_TOOL_LOOP_FAILED",
      message: message.slice(0, 500),
      retryable: true,
    },
  });

const runFailureTool = async (input: {
  seq: number;
  message: string;
  runtimeState: DistillRuntimeState;
  context: Omit<DistillToolContext, "runtimeState">;
  handlers: Map<DistillToolCall["toolName"], DistillToolHandler>;
  store: DistillToolRunStore;
  toolResults: DistillPlannerInput["toolResults"];
  logger?: DistillLogger;
}): Promise<DistillToolLoopResult> => {
  if (isTerminalDistillRuntimeState(input.runtimeState)) {
    return {
      runtimeState: input.runtimeState,
      status: mapTerminalStateToStatus(input.runtimeState),
      toolResults: input.toolResults,
    };
  }

  try {
    const call = buildFailedCall(input.message);
    const executed = await executeDistillToolStep({
      seq: input.seq,
      call,
      context: {
        ...input.context,
        runtimeState: input.runtimeState,
        allowSystemFailure: true,
      },
      handlers: input.handlers,
      store: input.store,
      logger: input.logger,
    });
    const toolResults = [
      ...input.toolResults,
      {
        seq: input.seq,
        toolName: call.toolName,
        ok: executed.result.ok,
        summary: executed.result.summary,
        data: executed.result.data,
      },
    ];
    return {
      runtimeState: executed.stateAfter,
      status: mapTerminalStateToStatus(executed.stateAfter),
      toolResults,
    };
  } catch {
    return {
      runtimeState: "FAILED",
      status: "failed",
      toolResults: input.toolResults,
    };
  }
};

export const runDistillToolLoop = async (input: {
  job: DistillPlannerJobContext;
  planner: DistillPlanner;
  handlers: Map<DistillToolCall["toolName"], DistillToolHandler>;
  context: Omit<DistillToolContext, "runtimeState">;
  getMemorySnapshot: () => DistillToolMemorySnapshot;
  maxToolCalls?: number;
  store?: DistillToolRunStore;
  logger?: DistillLogger;
}): Promise<DistillToolLoopResult> => {
  const maxToolCalls = input.maxToolCalls ?? 12;
  const store = input.store ?? buildDistillToolRunStore();
  let runtimeState: DistillRuntimeState = "START";
  let toolResults: DistillPlannerInput["toolResults"] = [];

  for (let seq = 1; seq <= maxToolCalls; seq += 1) {
    let call: DistillToolCall;
    try {
      call = await input.planner.nextToolCall({
        ...input.job,
        runtimeState,
        toolResults,
        memory: input.getMemorySnapshot(),
      });
      logDistillEvent(input.logger, "info", "persona_distill.planner.tool_selected", {
        jobId: input.job.jobId,
        personaId: input.job.personaId,
        actorUserId: input.job.actorUserId,
        seq,
        toolName: call.toolName,
        runtimeStateBefore: runtimeState,
        input: call.input,
      });
    } catch (error) {
      if (error instanceof DistillPlannerToolCallParseError) {
        await store.recordRejectedDistillPlannerCall({
          jobId: input.job.jobId,
          seq,
          runtimeStateBefore: runtimeState,
          rawToolName: error.rawToolName,
          rawArguments: error.rawArguments,
          errorMessage: error.message,
        });
        logDistillEvent(input.logger, "warn", "persona_distill.planner.tool_rejected", {
          jobId: input.job.jobId,
          personaId: input.job.personaId,
          actorUserId: input.job.actorUserId,
          seq,
          runtimeStateBefore: runtimeState,
          toolName: error.rawToolName,
          input: {
            rawToolName: error.rawToolName,
            rawArguments: error.rawArguments,
          },
          errorMessage: error.message,
        });
      }
      return runFailureTool({
        seq: seq + 1,
        message: error instanceof Error ? error.message : "distill planner failed",
        runtimeState,
        context: input.context,
        handlers: input.handlers,
        store,
        toolResults,
        logger: input.logger,
      });
    }

    if (call.toolName === "mark_job_failed") {
      return runFailureTool({
        seq: seq + 1,
        message: "Planner requested a system-controlled failure terminal tool",
        runtimeState,
        context: input.context,
        handlers: input.handlers,
        store,
        toolResults,
        logger: input.logger,
      });
    }

    try {
      const executed = await executeDistillToolStep({
        seq,
        call,
        context: {
          ...input.context,
          runtimeState,
        },
        handlers: input.handlers,
        store,
        logger: input.logger,
      });
      runtimeState = executed.stateAfter;
      toolResults = [
        ...toolResults,
        {
          seq,
          toolName: call.toolName as DistillToolName,
          ok: executed.result.ok,
          summary: executed.result.summary,
          data: executed.result.data,
        },
      ];

      if (isTerminalDistillRuntimeState(runtimeState)) {
        return {
          runtimeState,
          status: mapTerminalStateToStatus(runtimeState),
          toolResults,
        };
      }
    } catch (error) {
      return runFailureTool({
        seq: seq + 1,
        message: error instanceof Error ? error.message : "distill tool execution failed",
        runtimeState,
        context: input.context,
        handlers: input.handlers,
        store,
        toolResults,
        logger: input.logger,
      });
    }
  }

  return runFailureTool({
    seq: maxToolCalls + 1,
    message: `Distill tool loop exceeded max tool calls (${maxToolCalls})`,
    runtimeState,
    context: input.context,
    handlers: input.handlers,
    store,
    toolResults,
    logger: input.logger,
  });
};
