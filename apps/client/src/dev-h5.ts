import { loadLocalEnv } from "@hall-of-fame/runtime-env";

import { buildH5Server } from "./h5-app.js";

await loadLocalEnv();

const app = buildH5Server();
const port = Number(process.env.H5_PORT ?? 3100);

await app.listen({ host: "0.0.0.0", port });
