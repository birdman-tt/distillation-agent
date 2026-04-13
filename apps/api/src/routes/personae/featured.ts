import { featuredPersonaeResponseSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { listFeaturedPersonae } from "../../seed/official-personae.js";

export const featuredPersonaeRoute: FastifyPluginAsync = async (app) => {
  app.get("/v1/personae/featured", async () => {
    const payload = {
      items: listFeaturedPersonae().map((seed) => ({
        ...seed.persona,
        currentPublishedVersionId: seed.version.id,
        previewIntro: seed.version.previewIntro,
        recommendedQuestions: seed.version.recommendedQuestions,
      })),
    };

    return featuredPersonaeResponseSchema.parse(payload);
  });
};
