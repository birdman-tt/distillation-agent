import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { ensureDatabaseSchema } from "./db/bootstrap.js";
import { closeSql } from "./db/client.js";

await loadLocalEnv();

try {
  await ensureDatabaseSchema();
  console.log("Database bootstrap completed.");
} catch (error) {
  console.error("Database bootstrap failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeSql();
}
