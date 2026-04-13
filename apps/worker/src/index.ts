import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { buildWorkerApp } from "./app.js";

await loadLocalEnv();

const app = buildWorkerApp();
const port = Number(process.env.WORKER_PORT ?? 3001);

await app.listen({ host: "0.0.0.0", port });
