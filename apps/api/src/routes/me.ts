import { myPersonaeResponseSchema, personaInventoryResponseSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { listPersonaInventory } from "../db/repositories/persona-distill-repository.js";
import { listMyPersonae } from "../store/persona-store.js";
import { requireActorSession } from "../utils/actor-session.js";

export const meRoute: FastifyPluginAsync = async (app) => {
  app.get("/v1/me/personae", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    return myPersonaeResponseSchema.parse(await listMyPersonae(actor.userId));
  });

  app.get("/v1/me/persona-inventory", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    return personaInventoryResponseSchema.parse(await listPersonaInventory(actor.userId));
  });
};
