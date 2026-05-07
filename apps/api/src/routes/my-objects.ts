import { randomUUID } from "node:crypto";

import {
  deleteMyObjectResponseSchema,
  myObjectChatResponseSchema,
  myObjectActionResponseSchema,
  myObjectDetailSchema,
  chatSessionSchema,
  updateMyObjectSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import {
  confirmOwnedPersonaObject,
  deleteOwnedPersonaObject,
  getOwnedPersonaObjectChatTarget,
  getOwnedPersonaObjectDetail,
  OwnedObjectActionError,
  publishOwnedPersonaObject,
  updateOwnedPersonaObject,
} from "../db/repositories/persona-distill-repository.js";
import { saveChatSession } from "../store/chat-store.js";
import { requireActorSession } from "../utils/actor-session.js";

const sendObjectActionError = (reply: FastifyReply, error: OwnedObjectActionError) => {
  if (!error.object) {
    return reply.code(error.statusCode).send({ message: error.message });
  }

  return reply.code(error.statusCode).send(
    myObjectActionResponseSchema.parse({
      object: error.object,
      share: null,
      message: error.message,
    }),
  );
};

export const myObjectsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { objectId: string } }>("/v1/me/objects/:objectId", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const object = await getOwnedPersonaObjectDetail(actor.userId, request.params.objectId);
    if (!object) {
      return reply.code(404).send({ message: "Object not found" });
    }

    return myObjectDetailSchema.parse(object);
  });

  app.patch<{ Params: { objectId: string } }>("/v1/me/objects/:objectId", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const input = updateMyObjectSchema.parse(request.body ?? {});
    try {
      const result = await updateOwnedPersonaObject(actor.userId, request.params.objectId, input);
      if (!result) {
        return reply.code(404).send({ message: "Object not found" });
      }

      return myObjectActionResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof OwnedObjectActionError) {
        return sendObjectActionError(reply, error);
      }
      throw error;
    }
  });

  app.delete<{ Params: { objectId: string } }>("/v1/me/objects/:objectId", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const result = await deleteOwnedPersonaObject(actor.userId, request.params.objectId);
      if (!result) {
        return reply.code(404).send({ message: "Object not found" });
      }

      return deleteMyObjectResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof OwnedObjectActionError) {
        return sendObjectActionError(reply, error);
      }
      throw error;
    }
  });

  app.post<{ Params: { objectId: string } }>("/v1/me/objects/:objectId/confirm", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const result = await confirmOwnedPersonaObject(actor.userId, request.params.objectId);
      if (!result) {
        return reply.code(404).send({ message: "Object not found" });
      }

      return myObjectActionResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof OwnedObjectActionError) {
        return sendObjectActionError(reply, error);
      }
      throw error;
    }
  });

  app.post<{ Params: { objectId: string } }>("/v1/me/objects/:objectId/publish", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const result = await publishOwnedPersonaObject(actor.userId, request.params.objectId);
      if (!result) {
        return reply.code(404).send({ message: "Object not found" });
      }

      return myObjectActionResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof OwnedObjectActionError) {
        return sendObjectActionError(reply, error);
      }
      throw error;
    }
  });

  app.post<{ Params: { objectId: string } }>("/v1/me/objects/:objectId/chats", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    try {
      const target = await getOwnedPersonaObjectChatTarget(actor.userId, request.params.objectId);
      if (!target) {
        return reply.code(404).send({ message: "Object not found" });
      }

      const session = chatSessionSchema.parse({
        id: randomUUID(),
        targetType: "draft_version_preview",
        targetPersonaId: target.personaId,
        targetPersonaVersionId: target.personaVersionId,
        shareSlug: null,
        messages: [],
      });
      await saveChatSession(session, { createdByUserId: actor.userId });

      return myObjectChatResponseSchema.parse({
        chatId: session.id,
      });
    } catch (error) {
      if (error instanceof OwnedObjectActionError) {
        return sendObjectActionError(reply, error);
      }
      throw error;
    }
  });
};
