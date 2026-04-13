import { createFeedbackSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { addFeedback } from "../store/persona-store.js";
import { getActorSession } from "../utils/actor-session.js";
import { enforceWindowRateLimit } from "../utils/rate-limit.js";

export const feedbackRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/feedback", async (request, reply) => {
    const limit = enforceWindowRateLimit({
      key: `feedback:${request.ip || "unknown"}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return reply.code(429).send({
        message: "Too many feedback submissions, please retry later.",
        retryAfterMs: limit.retryAfterMs,
      });
    }

    const actor = getActorSession(request);
    const input = createFeedbackSchema.parse(request.body);

    return addFeedback({
      ...input,
      createdByUserId: actor?.userId,
    });
  });
};
