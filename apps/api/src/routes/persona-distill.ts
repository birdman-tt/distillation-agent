import {
  addDistillExtraSourcesRequestSchema,
  addDistillExtraSourcesResponseSchema,
  createDistillIntentRequestSchema,
  createDistillJobRequestSchema,
  createDistillJobResponseSchema,
  createDistillSourceDiscoveryRequestSchema,
  distillIntentResponseSchema,
  distillJobResponseSchema,
  distillJobTraceResponseSchema,
  distillSourceDiscoveryJobResponseSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import {
  addDistillExtraSources,
  createDistillIntent,
  createDistillJob,
  createDistillSourceDiscovery,
  getDistillSourceDiscoveryJob,
  getDistillJob,
  getDistillJobTrace,
  retryDistillSourceDiscoveryJob,
} from "../db/repositories/persona-distill-repository.js";
import { requireActorSession } from "../utils/actor-session.js";

const isDistillTraceApiEnabled = () => {
  if (process.env.PERSONA_DISTILL_TRACE_API_ENABLED === "true") {
    return true;
  }
  if (process.env.PERSONA_DISTILL_TRACE_API_ENABLED === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
};

export const personaDistillRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/persona-distill-intents", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const input = createDistillIntentRequestSchema.parse(request.body ?? {});
    const result = await createDistillIntent({
      query: input.query,
      usageIntent: input.usageIntent,
      focus: input.focus,
      actorUserId: actor.userId,
    });
    return distillIntentResponseSchema.parse(result);
  });

  app.post("/v1/persona-distill-source-discovery", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const input = createDistillSourceDiscoveryRequestSchema.parse(request.body ?? {});
      const result = await createDistillSourceDiscovery({
        intentId: input.intentId,
        preferredLanguage: input.preferredLanguage,
        maxSourcesPerBucket: input.maxSourcesPerBucket,
        actorUserId: actor.userId,
      });
      if (!result) {
        return reply.code(404).send({ message: "Distill intent not found" });
      }
      return distillSourceDiscoveryJobResponseSchema.parse(result);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Unable to discover sources" });
    }
  });

  app.get<{ Params: { sourceDiscoveryJobId: string } }>(
    "/v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId",
    async (request, reply) => {
      const actor = requireActorSession(request, reply);
      if (!actor) {
        return reply;
      }

      const result = await getDistillSourceDiscoveryJob(request.params.sourceDiscoveryJobId, actor.userId);
      if (!result) {
        return reply.code(404).send({ message: "Source discovery job not found" });
      }
      return distillSourceDiscoveryJobResponseSchema.parse(result);
    },
  );

  app.post<{ Params: { sourceDiscoveryJobId: string } }>(
    "/v1/persona-distill-source-discovery-jobs/:sourceDiscoveryJobId/retry",
    async (request, reply) => {
      const actor = requireActorSession(request, reply);
      if (!actor) {
        return reply;
      }

      try {
        const result = await retryDistillSourceDiscoveryJob(request.params.sourceDiscoveryJobId, actor.userId);
        if (!result) {
          return reply.code(404).send({ message: "Source discovery job not found" });
        }
        return distillSourceDiscoveryJobResponseSchema.parse(result);
      } catch (error) {
        return reply.code(409).send({ message: error instanceof Error ? error.message : "Unable to retry source discovery" });
      }
    },
  );

  app.post<{ Params: { discoveryId: string } }>(
    "/v1/persona-distill-discoveries/:discoveryId/extra-sources",
    async (request, reply) => {
      const actor = requireActorSession(request, reply);
      if (!actor) {
        return reply;
      }

      const input = addDistillExtraSourcesRequestSchema.parse(request.body ?? {});
      const result = await addDistillExtraSources({
        discoveryId: request.params.discoveryId,
        actorUserId: actor.userId,
        extraTextSources: input.extraTextSources,
        extraUrlSources: input.extraUrlSources,
      });
      if (!result) {
        return reply.code(404).send({ message: "Distill discovery not found" });
      }
      return addDistillExtraSourcesResponseSchema.parse(result);
    },
  );

  app.post("/v1/persona-distill-jobs", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const input = createDistillJobRequestSchema.parse(request.body ?? {});
      const result = await createDistillJob({
        intentId: input.intentId,
        discoveryId: input.discoveryId,
        selectedSourceCandidateIds: input.selectedSourceCandidateIds,
        selectedExtraSourceIds: input.selectedExtraSourceIds,
        actorUserId: actor.userId,
      });
      if (!result) {
        return reply.code(404).send({ message: "Distill context not found" });
      }
      return createDistillJobResponseSchema.parse(result);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Unable to create distill job" });
    }
  });

  app.get<{ Params: { jobId: string } }>("/v1/persona-distill-jobs/:jobId", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const result = await getDistillJob(request.params.jobId, actor.userId);
    if (!result) {
      return reply.code(404).send({ message: "Distill job not found" });
    }
    return distillJobResponseSchema.parse(result);
  });

  app.get<{ Params: { jobId: string } }>("/v1/persona-distill-jobs/:jobId/trace", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }
    if (!isDistillTraceApiEnabled()) {
      return reply.code(404).send({ message: "Distill job not found" });
    }

    const result = await getDistillJobTrace(request.params.jobId, actor.userId);
    if (!result) {
      return reply.code(404).send({ message: "Distill job not found" });
    }
    return distillJobTraceResponseSchema.parse(result);
  });
};
