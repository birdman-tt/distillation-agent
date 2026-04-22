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

export const getSql = () => {
  if (!sqlSingleton) {
    sqlSingleton = postgres(buildDatabaseUrl(process.env), {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 20,
    });
  }

  return sqlSingleton;
};

export const withTransaction = async <T>(run: (sql: postgres.TransactionSql) => Promise<T>) => getSql().begin(run);
