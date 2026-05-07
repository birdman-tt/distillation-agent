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
import { runDuePersonaDistillJobs } from "./jobs/persona-distill/run-persona-distill-jobs.js";
import { runDuePersonaSourceDiscoveryJobs } from "./jobs/persona-source-discovery/run-persona-source-discovery-jobs.js";
import { closeSql } from "./db/client.js";

const isChatProactiveEnabled = () => process.env.CHAT_PROACTIVE_ENABLED === "true";
const proactivePollIntervalMs = () => Number(process.env.CHAT_PROACTIVE_POLL_INTERVAL_MS ?? "5000");
const isPersonaDistillPollingEnabled = () => {
  const flag = process.env.PERSONA_DISTILL_POLLING_ENABLED;
  if (flag === "true") {
    return true;
  }
  if (flag === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
};
const personaDistillPollIntervalMs = () => Number(process.env.PERSONA_DISTILL_POLL_INTERVAL_MS ?? "5000");
const isPersonaSourceDiscoveryPollingEnabled = () => {
  const flag = process.env.PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED;
  if (flag === "true") {
    return true;
  }
  if (flag === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
};
const personaSourceDiscoveryPollIntervalMs = () => Number(process.env.PERSONA_SOURCE_DISCOVERY_POLL_INTERVAL_MS ?? "5000");

export const buildWorkerApp = () => {
  const app = Fastify({ logger: true });
  let proactivePoller: NodeJS.Timeout | null = null;
  let personaDistillPoller: NodeJS.Timeout | null = null;
  let personaSourceDiscoveryPoller: NodeJS.Timeout | null = null;

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
  app.post("/internal/persona-distill/run-due", async () => runDuePersonaDistillJobs({ logger: app.log }));
  app.post("/internal/persona-source-discovery/run-due", async () => runDuePersonaSourceDiscoveryJobs());

  app.addHook("onReady", async () => {
    if (isChatProactiveEnabled()) {
      proactivePoller = setInterval(() => {
        void runDueChatProactiveJobs().catch((error) => {
          app.log.warn(
            { kind: "chat_proactive_poll_failed", errorMessage: error instanceof Error ? error.message : "unknown" },
            "chat proactive poll failed",
          );
        });
      }, proactivePollIntervalMs());
    }

    if (isPersonaDistillPollingEnabled()) {
      personaDistillPoller = setInterval(() => {
        void runDuePersonaDistillJobs({ logger: app.log }).catch((error) => {
          app.log.warn(
            { kind: "persona_distill_poll_failed", errorMessage: error instanceof Error ? error.message : "unknown" },
            "persona distill poll failed",
          );
        });
      }, personaDistillPollIntervalMs());
      personaDistillPoller.unref();
    }

    if (isPersonaSourceDiscoveryPollingEnabled()) {
      personaSourceDiscoveryPoller = setInterval(() => {
        void runDuePersonaSourceDiscoveryJobs().catch((error) => {
          app.log.warn(
            { kind: "persona_source_discovery_poll_failed", errorMessage: error instanceof Error ? error.message : "unknown" },
            "persona source discovery poll failed",
          );
        });
      }, personaSourceDiscoveryPollIntervalMs());
      personaSourceDiscoveryPoller.unref();
    }
  });

  app.addHook("onClose", async () => {
    if (proactivePoller) {
      clearInterval(proactivePoller);
    }
    if (personaDistillPoller) {
      clearInterval(personaDistillPoller);
    }
    if (personaSourceDiscoveryPoller) {
      clearInterval(personaSourceDiscoveryPoller);
    }
    await closeSql();
  });

  return app;
};

export const __internal = {
  isPersonaDistillPollingEnabled,
  isPersonaSourceDiscoveryPollingEnabled,
};
