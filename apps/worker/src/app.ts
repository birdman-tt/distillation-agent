import Fastify from "fastify";
import {
  workerDistillRequestSchema,
  workerDistillResponseSchema,
  workerSourceIngestRequestSchema,
  workerSourceIngestResponseSchema,
} from "@hall-of-fame/contracts";

import { runDistillJob } from "./jobs/distill/run-distill-job.js";
import { runSourceIngestJob } from "./jobs/source-ingest/run-source-ingest.js";
import { runDueChatProactiveJobs } from "./jobs/chat-proactive/run-chat-proactive-job.js";
import { closeSql } from "./db/client.js";

const isChatProactiveEnabled = () => process.env.CHAT_PROACTIVE_ENABLED === "true";
const proactivePollIntervalMs = () => Number(process.env.CHAT_PROACTIVE_POLL_INTERVAL_MS ?? "5000");

export const buildWorkerApp = () => {
  const app = Fastify({ logger: true });
  let proactivePoller: NodeJS.Timeout | null = null;

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

  app.post("/internal/chat-proactive/run-due", async () => runDueChatProactiveJobs());

  app.addHook("onReady", async () => {
    if (!isChatProactiveEnabled()) {
      return;
    }

    proactivePoller = setInterval(() => {
      void runDueChatProactiveJobs().catch((error) => {
        app.log.warn(
          { kind: "chat_proactive_poll_failed", errorMessage: error instanceof Error ? error.message : "unknown" },
          "chat proactive poll failed",
        );
      });
    }, proactivePollIntervalMs());
  });

  app.addHook("onClose", async () => {
    if (proactivePoller) {
      clearInterval(proactivePoller);
    }
    await closeSql();
  });

  return app;
};
