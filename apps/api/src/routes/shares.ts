import { shareLandingResponseSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { getShareLanding } from "../store/persona-store.js";

export const sharesRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { shareSlug: string } }>("/v1/shares/:shareSlug", async (request, reply) => {
    const landing = await getShareLanding(request.params.shareSlug);
    if (!landing) {
      return reply.code(404).send({ message: "Share not found" });
    }

    return shareLandingResponseSchema.parse(landing);
  });
};
