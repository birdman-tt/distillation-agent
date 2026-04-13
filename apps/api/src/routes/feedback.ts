import { createFeedbackSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { resolveActorUserId } from "../store/auth-store.js";
import { addFeedback } from "../store/persona-store.js";

export const feedbackRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/feedback", async (request) => {
    const actorUserId = resolveActorUserId(request.headers["x-user-id"]?.toString());
    const input = createFeedbackSchema.parse(request.body);

    return addFeedback({
      ...input,
      createdByUserId: actorUserId,
    });
  });
};
