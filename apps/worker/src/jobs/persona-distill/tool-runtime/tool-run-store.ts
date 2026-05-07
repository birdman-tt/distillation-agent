import { randomUUID } from "node:crypto";

import type { DistillRuntimeState, DistillToolName } from "@hall-of-fame/contracts";
import type postgres from "postgres";

import { getSql } from "../../../db/client.js";
import { sanitizeDistillToolTraceJson } from "./trace-sanitizer.js";

export type DistillToolRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";

type SqlTag = {
  <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  json(value: postgres.JSONValue): unknown;
};

export const buildDistillToolRunStore = (sql: SqlTag = getSql() as unknown as SqlTag) => ({
  async recordRejectedDistillPlannerCall(input: {
    jobId: string;
    seq: number;
    runtimeStateBefore: DistillRuntimeState;
    rawToolName: string | null;
    rawArguments: unknown;
    errorMessage: string;
  }) {
    const id = randomUUID();
    const sanitizedInput = sanitizeDistillToolTraceJson({
      rawToolName: input.rawToolName,
      rawArguments: input.rawArguments,
      runtimeState: input.runtimeStateBefore,
    }) as postgres.JSONValue;
    const sanitizedOutput = sanitizeDistillToolTraceJson({
      rejected: true,
      reason: input.errorMessage,
    }) as postgres.JSONValue;
    const rows = await sql<Array<{ id: string }>>`
      insert into persona_distill_tool_runs (
        id,
        job_id,
        seq,
        tool_name,
        runtime_state_before,
        runtime_state_after,
        input_json,
        output_json,
        status,
        error_message,
        started_at,
        finished_at
      ) values (
        ${id}::uuid,
        ${input.jobId}::uuid,
        ${input.seq},
        ${input.rawToolName?.trim() || "planner_invalid_tool_call"},
        ${input.runtimeStateBefore},
        null,
        ${sql.json(sanitizedInput)},
        ${sql.json(sanitizedOutput)},
        ${"REJECTED"},
        ${input.errorMessage},
        now(),
        now()
      )
      returning id
    `;
    return rows[0] ?? { id };
  },

  async startDistillToolRun(input: {
    jobId: string;
    seq: number;
    toolName: DistillToolName;
    runtimeStateBefore: DistillRuntimeState;
    inputJson: unknown;
  }) {
    const id = randomUUID();
    const sanitizedInput = sanitizeDistillToolTraceJson(input.inputJson) as postgres.JSONValue;
    const rows = await sql<Array<{ id: string }>>`
      insert into persona_distill_tool_runs (
        id,
        job_id,
        seq,
        tool_name,
        runtime_state_before,
        input_json,
        status,
        started_at
      ) values (
        ${id}::uuid,
        ${input.jobId}::uuid,
        ${input.seq},
        ${input.toolName},
        ${input.runtimeStateBefore},
        ${sql.json(sanitizedInput)},
        ${"RUNNING"},
        now()
      )
      returning id
    `;
    return rows[0] ?? { id };
  },

  async finishDistillToolRun(input: {
    id: string;
    status: Exclude<DistillToolRunStatus, "RUNNING">;
    runtimeStateAfter: DistillRuntimeState | null;
    outputJson: unknown;
    errorMessage?: string | null;
  }) {
    const sanitizedOutput = sanitizeDistillToolTraceJson(input.outputJson) as postgres.JSONValue;
    await sql`
      update persona_distill_tool_runs
         set status = ${input.status},
             runtime_state_after = ${input.runtimeStateAfter},
             output_json = ${sql.json(sanitizedOutput)},
             error_message = ${input.errorMessage ?? null},
             finished_at = now()
       where id = ${input.id}::uuid
    `;
  },
});

export const startDistillToolRun = (input: Parameters<ReturnType<typeof buildDistillToolRunStore>["startDistillToolRun"]>[0]) =>
  buildDistillToolRunStore().startDistillToolRun(input);

export const finishDistillToolRun = (input: Parameters<ReturnType<typeof buildDistillToolRunStore>["finishDistillToolRun"]>[0]) =>
  buildDistillToolRunStore().finishDistillToolRun(input);
