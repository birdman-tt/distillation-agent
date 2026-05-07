import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { closeSql, getSql } from "../../../db/client.js";
import { buildDistillToolRunStore } from "./tool-run-store.js";

const buildFakeSql = () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const jsonCalls: unknown[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join("?"), values });
    return [{ id: "00000000-0000-4000-8000-000000000999" }];
  };
  sql.json = (value: unknown) => {
    jsonCalls.push(value);
    return { __json: value };
  };
  return { sql, calls, jsonCalls };
};

test("tool run store writes running trace rows with sanitized input", async () => {
  const { sql, calls, jsonCalls } = buildFakeSql();
  const store = buildDistillToolRunStore(sql as any);

  const started = await store.startDistillToolRun({
    jobId: "00000000-0000-4000-8000-000000000001",
    seq: 1,
    toolName: "search_sources",
    runtimeStateBefore: "RISK_CHECKED",
    inputJson: {
      query: "纪晓岚",
      content: "secret source text",
    },
  });

  assert.equal(started.id, "00000000-0000-4000-8000-000000000999");
  assert.match(calls[0]?.sql ?? "", /insert into persona_distill_tool_runs/);
  assert.deepEqual(jsonCalls[0], {
    query: "纪晓岚",
    content: "[redacted]",
  });
  assert.deepEqual(calls[0]?.values[5], {
    __json: {
      query: "纪晓岚",
      content: "[redacted]",
    },
  });
  assert.equal(calls[0]?.values[6], "RUNNING");
});

test("tool run store records rejected planner calls with sanitized JSON", async () => {
  const { sql, calls, jsonCalls } = buildFakeSql();
  const store = buildDistillToolRunStore(sql as any);

  await store.recordRejectedDistillPlannerCall({
    jobId: "00000000-0000-4000-8000-000000000001",
    seq: 2,
    runtimeStateBefore: "START",
    rawToolName: "drop_database",
    rawArguments: {
      content: "secret planner payload",
    },
    errorMessage: "tool is not allowed",
  });

  assert.match(calls[0]?.sql ?? "", /insert into persona_distill_tool_runs/);
  assert.equal(calls[0]?.values[3], "drop_database");
  assert.deepEqual(jsonCalls[0], {
    rawToolName: "drop_database",
    rawArguments: {
      content: "[redacted]",
    },
    runtimeState: "START",
  });
  assert.deepEqual(jsonCalls[1], {
    rejected: true,
    reason: "tool is not allowed",
  });
  assert.equal(calls[0]?.values[7], "REJECTED");
});

test("tool run store finishes trace rows with sanitized output", async () => {
  const { sql, calls, jsonCalls } = buildFakeSql();
  const store = buildDistillToolRunStore(sql as any);

  await store.finishDistillToolRun({
    id: "00000000-0000-4000-8000-000000000999",
    status: "REJECTED",
    runtimeStateAfter: null,
    outputJson: {
      message: "illegal state",
      normalizedText: "should never be stored",
    },
    errorMessage: "not allowed",
  });

  assert.match(calls[0]?.sql ?? "", /update persona_distill_tool_runs/);
  assert.equal(calls[0]?.values[0], "REJECTED");
  assert.equal(calls[0]?.values[1], null);
  assert.deepEqual(jsonCalls[0], {
    message: "illegal state",
    normalizedText: "[redacted]",
  });
  assert.deepEqual(calls[0]?.values[2], {
    __json: {
      message: "illegal state",
      normalizedText: "[redacted]",
    },
  });
  assert.equal(calls[0]?.values[3], "not allowed");
});

test("tool run store persists sanitized JSONB rows against postgres", async (t) => {
  const sql = getSql();

  try {
    await sql`select 1`;
  } catch (error) {
    await closeSql();
    t.skip(`database unavailable for JSONB integration check: ${(error as Error).message}`);
    return;
  }

  const tables = await sql<Array<{ jobsTable: string | null; runsTable: string | null }>>`
    select
      to_regclass('public.persona_distill_jobs')::text as "jobsTable",
      to_regclass('public.persona_distill_tool_runs')::text as "runsTable"
  `;
  if (!tables[0]?.jobsTable || !tables[0]?.runsTable) {
    await closeSql();
    t.skip("persona distill schema is unavailable for JSONB integration check");
    return;
  }

  const userId = randomUUID();
  const intentId = randomUUID();
  const discoveryId = randomUUID();
  const jobId = randomUUID();

  try {
    await sql`
      insert into users (id, display_name)
      values (${userId}::uuid, ${"tool-run-jsonb-test"})
    `;
    await sql`
      insert into persona_distill_intents (
        id,
        created_by_user_id,
        query,
        normalized_name,
        entity_type,
        usage_intent,
        focus,
        risk_decision,
        risk_reasons,
        coverage_hint,
        next_step
      ) values (
        ${intentId}::uuid,
        ${userId}::uuid,
        ${"纪晓岚"},
        ${"纪晓岚"},
        ${"FICTIONAL_CHARACTER"},
        ${"chat_companion"},
        ${sql.json(["说话方式"])},
        ${"ALLOW"},
        ${sql.json([])},
        ${"enough"},
        ${"select_sources"}
      )
    `;
    await sql`
      insert into persona_distill_discoveries (
        id,
        intent_id,
        created_by_user_id,
        bucket_coverage,
        missing_buckets,
        quality_warnings,
        sanitizer_version
      ) values (
        ${discoveryId}::uuid,
        ${intentId}::uuid,
        ${userId}::uuid,
        ${sql.json({ public_profile: 1 })},
        ${sql.json([])},
        ${sql.json([])},
        ${"test"}
      )
    `;
    await sql`
      insert into persona_distill_jobs (
        id,
        created_by_user_id,
        intent_id,
        discovery_id,
        query,
        normalized_name,
        entity_type,
        risk_decision,
        status,
        current_step,
        progress,
        selected_source_candidate_ids,
        selected_extra_source_ids,
        missing_requirements_json
      ) values (
        ${jobId}::uuid,
        ${userId}::uuid,
        ${intentId}::uuid,
        ${discoveryId}::uuid,
        ${"纪晓岚"},
        ${"纪晓岚"},
        ${"FICTIONAL_CHARACTER"},
        ${"ALLOW"},
        ${"QUEUED"},
        ${"queued"},
        ${0},
        ${sql.json([])},
        ${sql.json([])},
        ${sql.json([])}
      )
    `;

    const store = buildDistillToolRunStore();
    const started = await store.startDistillToolRun({
      jobId,
      seq: 7,
      toolName: "search_sources",
      runtimeStateBefore: "RISK_CHECKED",
      inputJson: {
        query: "纪晓岚",
        content: "raw source content",
      },
    });

    await store.finishDistillToolRun({
      id: started.id,
      status: "SUCCEEDED",
      runtimeStateAfter: "SOURCES_COLLECTED",
      outputJson: {
        count: 1,
        normalizedText: "clean source content",
      },
    });

    const rows = await sql<
      Array<{
        inputJson: unknown;
        outputJson: unknown;
        status: string;
        runtimeStateAfter: string | null;
      }>
    >`
      select
        input_json as "inputJson",
        output_json as "outputJson",
        status,
        runtime_state_after as "runtimeStateAfter"
      from persona_distill_tool_runs
      where id = ${started.id}::uuid
    `;

    assert.deepEqual(rows[0]?.inputJson, {
      query: "纪晓岚",
      content: "[redacted]",
    });
    assert.deepEqual(rows[0]?.outputJson, {
      count: 1,
      normalizedText: "[redacted]",
    });
    assert.equal(rows[0]?.status, "SUCCEEDED");
    assert.equal(rows[0]?.runtimeStateAfter, "SOURCES_COLLECTED");
  } finally {
    await sql`
      delete from persona_distill_tool_runs
      where job_id = ${jobId}::uuid
    `;
    await sql`
      delete from persona_distill_jobs
      where id = ${jobId}::uuid
    `;
    await sql`
      delete from persona_distill_discoveries
      where id = ${discoveryId}::uuid
    `;
    await sql`
      delete from persona_distill_intents
      where id = ${intentId}::uuid
    `;
    await sql`
      delete from users
      where id = ${userId}::uuid
    `;
    await closeSql();
  }
});
