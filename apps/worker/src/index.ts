import { buildWorkerApp } from "./app.js";

const app = buildWorkerApp();
const port = Number(process.env.WORKER_PORT ?? 3001);

await app.listen({ host: "0.0.0.0", port });
