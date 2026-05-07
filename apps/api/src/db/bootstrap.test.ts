import assert from "node:assert/strict";
import test from "node:test";

import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { ensureDatabaseSchema } from "./bootstrap.js";
import { getSql, resetSqlForTests } from "./client.js";

test("ensureDatabaseSchema creates persona distill source discovery job schema", async () => {
  await loadLocalEnv();
  const sql = getSql();

  try {
    await ensureDatabaseSchema();

    const columns = await sql<
      Array<{
        columnName: string;
        isNullable: "YES" | "NO";
        columnDefault: string | null;
      }>
    >`
      select
        column_name as "columnName",
        is_nullable as "isNullable",
        column_default as "columnDefault"
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'persona_distill_source_discovery_jobs'
    `;
    const columnByName = new Map(columns.map((column) => [column.columnName, column]));

    for (const columnName of [
      "id",
      "intent_id",
      "created_by_user_id",
      "preferred_language",
      "max_sources_per_bucket",
      "status",
      "current_step",
      "progress",
      "discovery_id",
      "source_count",
      "safe_error_message",
      "retryable",
      "next_run_at",
      "claimed_by_worker_id",
      "heartbeat_at",
      "attempt_count",
      "created_at",
      "updated_at",
    ]) {
      assert.ok(columnByName.has(columnName), `missing column ${columnName}`);
    }

    assert.equal(columnByName.get("discovery_id")?.isNullable, "YES");
    assert.equal(columnByName.get("progress")?.isNullable, "NO");
    assert.match(columnByName.get("progress")?.columnDefault ?? "", /\b0\b/);
    assert.equal(columnByName.get("attempt_count")?.isNullable, "NO");
    assert.match(columnByName.get("attempt_count")?.columnDefault ?? "", /\b0\b/);
    assert.equal(columnByName.get("next_run_at")?.isNullable, "NO");
    assert.match(columnByName.get("next_run_at")?.columnDefault ?? "", /now\(\)/);

    const indexes = await sql<Array<{ indexname: string }>>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'persona_distill_source_discovery_jobs'
    `;
    const indexNames = new Set(indexes.map((index) => index.indexname));

    assert.ok(indexNames.has("persona_distill_source_discovery_jobs_status_due_idx"));
    assert.ok(indexNames.has("persona_distill_source_discovery_jobs_creator_updated_idx"));
    assert.ok(indexNames.has("persona_distill_source_discovery_jobs_status_heartbeat_idx"));
  } finally {
    await resetSqlForTests();
  }
});
