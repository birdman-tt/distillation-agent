import { personaDetailResponseSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { findPersonaSeedByPersonaId } from "../../seed/official-personae.js";

export const personaDetailRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId", async (request, reply) => {
    const seed = findPersonaSeedByPersonaId(request.params.personaId);

    if (!seed) {
      return reply.code(404).send({
        message: "Persona not found",
      });
    }

    return personaDetailResponseSchema.parse({
      persona: {
        ...seed.persona,
        currentPublishedVersionId: seed.version.id,
      },
      version: seed.version,
    });
  });
};
