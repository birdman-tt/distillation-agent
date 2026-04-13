import Fastify from "fastify";
import {
  workerDistillRequestSchema,
  workerDistillResponseSchema,
  workerSourceIngestRequestSchema,
  workerSourceIngestResponseSchema,
} from "@hall-of-fame/contracts";

import { runDistillJob } from "./jobs/distill/run-distill-job.js";
import { runSourceIngestJob } from "./jobs/source-ingest/run-source-ingest.js";

export const buildWorkerApp = () => {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    ok: true,
    service: "hall-of-fame-worker",
  }));

  app.post("/internal/source-ingest", async (request) => {
    const input = workerSourceIngestRequestSchema.parse(request.body);
    const result = await runSourceIngestJob(input);
    return workerSourceIngestResponseSchema.parse(result);
  });

  app.post("/internal/distill", async (request) => {
    const input = workerDistillRequestSchema.parse(request.body);
    const result = await runDistillJob(input);
    return workerDistillResponseSchema.parse(result);
  });

  return app;
};
