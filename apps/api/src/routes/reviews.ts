import {
  listPendingSourceReviewsResponseSchema,
  listPendingVersionReviewsResponseSchema,
  reviewPersonaVersionPublishSchema,
  reviewSourceSchema,
  shareLinkResponseSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import {
  listPendingPublishReviews,
  listPendingSourceReviews,
  reviewPublishRequest,
  reviewSource,
} from "../store/persona-store.js";
import { requireReviewerSession } from "../utils/actor-session.js";

export const reviewsRoute: FastifyPluginAsync = async (app) => {
  app.get("/v1/reviews/sources", async (request, reply) => {
    if (!requireReviewerSession(request, reply)) {
      return reply;
    }

    const status = (request.query as { status?: string }).status;
    const items = status && status !== "PENDING_REVIEW" ? [] : listPendingSourceReviews();
    return listPendingSourceReviewsResponseSchema.parse({ items });
  });

  app.post<{ Params: { sourceId: string } }>("/v1/reviews/sources/:sourceId/approve", async (request, reply) => {
    const actor = requireReviewerSession(request, reply);
    if (!actor) {
      return reply;
    }

    const input = reviewSourceSchema.parse({
      sourceId: request.params.sourceId,
      decision: "APPROVED",
      reason: (request.body as { reason?: string } | undefined)?.reason ?? "Approved by reviewer",
    });

    const source = reviewSource(input.sourceId, {
      reviewerUserId: actor.userId,
      decision: input.decision,
      reason: input.reason,
    });

    if (!source) {
      return reply.code(404).send({ message: "Source not found" });
    }

    return source;
  });

  app.post<{ Params: { sourceId: string } }>("/v1/reviews/sources/:sourceId/reject", async (request, reply) => {
    const actor = requireReviewerSession(request, reply);
    if (!actor) {
      return reply;
    }

    const input = reviewSourceSchema.parse({
      sourceId: request.params.sourceId,
      decision: "REJECTED",
      reason: (request.body as { reason?: string } | undefined)?.reason ?? "Rejected by reviewer",
    });

    const source = reviewSource(input.sourceId, {
      reviewerUserId: actor.userId,
      decision: input.decision,
      reason: input.reason,
    });

    if (!source) {
      return reply.code(404).send({ message: "Source not found" });
    }

    return source;
  });

  app.get("/v1/reviews/persona-versions", async (request, reply) => {
    if (!requireReviewerSession(request, reply)) {
      return reply;
    }

    const status = (request.query as { status?: string }).status;
    const items = status && status !== "PENDING_PUBLISH_REVIEW" ? [] : listPendingPublishReviews();
    return listPendingVersionReviewsResponseSchema.parse({ items });
  });

  app.post<{ Params: { personaVersionId: string } }>(
    "/v1/reviews/persona-versions/:personaVersionId/approve-publish",
    async (request, reply) => {
      const actor = requireReviewerSession(request, reply);
      if (!actor) {
        return reply;
      }

      const input = reviewPersonaVersionPublishSchema.parse({
        personaVersionId: request.params.personaVersionId,
        decision: "APPROVED",
        reason: (request.body as { reason?: string } | undefined)?.reason ?? "Approved for publish",
      });

      try {
        const result = reviewPublishRequest(input.personaVersionId, {
          reviewerUserId: actor.userId,
          decision: input.decision,
          reason: input.reason,
        });

        if (!result) {
          return reply.code(404).send({ message: "Version not found" });
        }

        return {
          version: result.version,
          share: result.share ? shareLinkResponseSchema.parse(result.share) : null,
        };
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : "Unable to approve publish request",
        });
      }
    },
  );

  app.post<{ Params: { personaVersionId: string } }>(
    "/v1/reviews/persona-versions/:personaVersionId/reject-publish",
    async (request, reply) => {
      const actor = requireReviewerSession(request, reply);
      if (!actor) {
        return reply;
      }

      const input = reviewPersonaVersionPublishSchema.parse({
        personaVersionId: request.params.personaVersionId,
        decision: "REJECTED",
        reason: (request.body as { reason?: string } | undefined)?.reason ?? "Rejected for publish",
      });

      const result = reviewPublishRequest(input.personaVersionId, {
        reviewerUserId: actor.userId,
        decision: input.decision,
        reason: input.reason,
      });

      if (!result) {
        return reply.code(404).send({ message: "Version not found" });
      }

      return {
        version: result.version,
        share: null,
      };
    },
  );
};
