import postgres from "postgres";

import { buildDatabaseUrl } from "./config.js";

let sqlSingleton: postgres.Sql | null = null;

export const closeSql = async () => {
  if (sqlSingleton) {
    await sqlSingleton.end({ timeout: 0 });
    sqlSingleton = null;
  }
};

export const resetSqlForTests = async () => {
  await closeSql();
};

const isSupabaseUrl = (url: string) =>
  url.includes("supabase.com") || url.includes("pooler.supabase");

export const getSql = () => {
  if (!sqlSingleton) {
    const url = buildDatabaseUrl(process.env);
    sqlSingleton = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 20,
      ssl: isSupabaseUrl(url) ? "require" : false,
    });
  }

  return sqlSingleton;
};

export const withTransaction = async <T>(run: (sql: postgres.TransactionSql) => Promise<T>) => getSql().begin(run);
