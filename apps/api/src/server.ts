import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { buildApiApp } from "./app.js";

await loadLocalEnv();

const app = buildApiApp();
const port = Number(process.env.APP_PORT ?? 3000);

await app.listen({ host: "0.0.0.0", port });
