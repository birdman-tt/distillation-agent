import { readFile } from "node:fs/promises";

import { getSql } from "./client.js";

let bootstrapPromise: Promise<void> | null = null;

const schemaFileUrl = new URL("./schema.sql", import.meta.url);
const schemaSentinelTable = "persona_version_publish_reviews";

export const resetDatabaseBootstrapForTests = () => {
  bootstrapPromise = null;
};

export const ensureDatabaseSchema = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const sql = getSql();
      const existing = await sql<{ exists: string | null }[]>`
        select to_regclass(${`public.${schemaSentinelTable}`}) as exists
      `;

      if (existing[0]?.exists) {
        return;
      }

      const schemaSql = await readFile(schemaFileUrl, "utf8");
      await sql.unsafe(schemaSql);
    })();
  }

  return bootstrapPromise;
};
