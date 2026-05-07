import {
  distillToolCallSchema,
  distillToolResultSchema,
  type DistillRuntimeState,
  type DistillToolCall,
  type DistillToolResult,
} from "@hall-of-fame/contracts";

import {
  DistillToolStateError,
  getNextRuntimeStateForTool,
} from "./state-machine.js";
import {
  buildDistillToolRegistry,
  type DistillToolContext,
  type DistillToolHandler,
} from "./tool-registry.js";
import { buildDistillToolRunStore } from "./tool-run-store.js";
import { logDistillEvent, type DistillLogger } from "../distill-logger.js";

type DistillToolRunStore = ReturnType<typeof buildDistillToolRunStore>;

export const executeDistillToolStep = async (input: {
  seq: number;
  call: DistillToolCall;
  context: DistillToolContext;
  handlers?: Map<DistillToolCall["toolName"], DistillToolHandler>;
  store?: DistillToolRunStore;
  logger?: DistillLogger;
}): Promise<{ stateAfter: DistillRuntimeState; result: DistillToolResult }> => {
  const call = distillToolCallSchema.parse(input.call);
  const store = input.store ?? buildDistillToolRunStore();
  const startedAt = Date.now();
  const run = await store.startDistillToolRun({
    jobId: input.context.jobId,
    seq: input.seq,
    toolName: call.toolName,
    runtimeStateBefore: input.context.runtimeState,
    inputJson: call.input,
  });
  logDistillEvent(input.logger, "info", "persona_distill.tool.started", {
    jobId: input.context.jobId,
    personaId: input.context.personaId,
    actorUserId: input.context.actorUserId,
    seq: input.seq,
    toolName: call.toolName,
    runtimeStateBefore: input.context.runtimeState,
    input: call.input,
  });

  let nextState: DistillRuntimeState;
  try {
    nextState = getNextRuntimeStateForTool(input.context.runtimeState, call.toolName);
  } catch (error) {
    await store.finishDistillToolRun({
      id: run.id,
      status: "REJECTED",
      runtimeStateAfter: null,
      outputJson: {
        rejected: true,
        reason: error instanceof Error ? error.message : "tool state rejected",
      },
      errorMessage: error instanceof Error ? error.message : "tool state rejected",
    });
    logDistillEvent(input.logger, "warn", "persona_distill.tool.rejected", {
      jobId: input.context.jobId,
      personaId: input.context.personaId,
      actorUserId: input.context.actorUserId,
      seq: input.seq,
      toolName: call.toolName,
      runtimeStateBefore: input.context.runtimeState,
      status: "REJECTED",
      durationMs: Date.now() - startedAt,
      output: {
        rejected: true,
        reason: error instanceof Error ? error.message : "tool state rejected",
      },
      errorMessage: error instanceof Error ? error.message : "tool state rejected",
    });
    throw error;
  }

  const handlers = input.handlers ?? buildDistillToolRegistry();
  const handler = handlers.get(call.toolName);
  if (!handler) {
    const error = new DistillToolStateError(`Tool ${call.toolName} has no registered handler`);
    await store.finishDistillToolRun({
      id: run.id,
      status: "REJECTED",
      runtimeStateAfter: null,
      outputJson: { rejected: true, reason: error.message },
      errorMessage: error.message,
    });
    logDistillEvent(input.logger, "warn", "persona_distill.tool.rejected", {
      jobId: input.context.jobId,
      personaId: input.context.personaId,
      actorUserId: input.context.actorUserId,
      seq: input.seq,
      toolName: call.toolName,
      runtimeStateBefore: input.context.runtimeState,
      status: "REJECTED",
      durationMs: Date.now() - startedAt,
      output: { rejected: true, reason: error.message },
      errorMessage: error.message,
    });
    throw error;
  }

  try {
    const handlerResult = distillToolResultSchema.parse(await handler.execute(call.input, input.context));
    if (handlerResult.stateAfter !== nextState) {
      const error = new DistillToolStateError(
        `Tool ${call.toolName} returned state ${handlerResult.stateAfter}; expected ${nextState}`,
      );
      await store.finishDistillToolRun({
        id: run.id,
        status: "FAILED",
        runtimeStateAfter: nextState,
        outputJson: {
          rejected: true,
          reason: error.message,
          handlerStateAfter: handlerResult.stateAfter,
          expectedStateAfter: nextState,
        },
        errorMessage: error.message,
      });
      logDistillEvent(input.logger, "error", "persona_distill.tool.failed", {
        jobId: input.context.jobId,
        personaId: input.context.personaId,
        actorUserId: input.context.actorUserId,
        seq: input.seq,
        toolName: call.toolName,
        runtimeStateBefore: input.context.runtimeState,
        runtimeStateAfter: nextState,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        output: {
          rejected: true,
          reason: error.message,
          handlerStateAfter: handlerResult.stateAfter,
          expectedStateAfter: nextState,
        },
        errorMessage: error.message,
      });
      throw error;
    }

    const result = {
      ...handlerResult,
      stateAfter: nextState,
    };
    await store.finishDistillToolRun({
      id: run.id,
      status: "SUCCEEDED",
      runtimeStateAfter: nextState,
      outputJson: result,
      errorMessage: null,
    });
    logDistillEvent(input.logger, "info", "persona_distill.tool.finished", {
      jobId: input.context.jobId,
      personaId: input.context.personaId,
      actorUserId: input.context.actorUserId,
      seq: input.seq,
      toolName: call.toolName,
      runtimeStateBefore: input.context.runtimeState,
      runtimeStateAfter: nextState,
      status: "SUCCEEDED",
      durationMs: Date.now() - startedAt,
      output: result,
    });
    return {
      stateAfter: nextState,
      result,
    };
  } catch (error) {
    if (error instanceof DistillToolStateError) {
      throw error;
    }
    await store.finishDistillToolRun({
      id: run.id,
      status: "FAILED",
      runtimeStateAfter: nextState,
      outputJson: {
        failed: true,
        reason: error instanceof Error ? error.message : "tool execution failed",
      },
      errorMessage: error instanceof Error ? error.message : "tool execution failed",
    });
    logDistillEvent(input.logger, "error", "persona_distill.tool.failed", {
      jobId: input.context.jobId,
      personaId: input.context.personaId,
      actorUserId: input.context.actorUserId,
      seq: input.seq,
      toolName: call.toolName,
      runtimeStateBefore: input.context.runtimeState,
      runtimeStateAfter: nextState,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      output: {
        failed: true,
        reason: error instanceof Error ? error.message : "tool execution failed",
      },
      errorMessage: error instanceof Error ? error.message : "tool execution failed",
    });
    throw error;
  }
};
