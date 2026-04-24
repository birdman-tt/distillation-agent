import {
  createShareSchema,
  personaVersionResponseSchema,
  publishPersonaVersionResponseSchema,
  publishPersonaVersionSchema,
  shareLinkResponseSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import {
  canManagePersona,
  canAccessPersonaVersion,
  createShareForVersion,
  getPersonaVersion,
  publishPersonaVersion,
  submitPublishReview,
} from "../store/persona-store.js";
import { getActorSession, requireActorSession } from "../utils/actor-session.js";

export const personaVersionsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { personaVersionId: string } }>("/v1/persona-versions/:personaVersionId", async (request, reply) => {
    const version = await getPersonaVersion(request.params.personaVersionId);
    if (!version) {
      return reply.code(404).send({ message: "Version not found" });
    }

    const actor = getActorSession(request);
    if (!(await canAccessPersonaVersion(version.id, actor?.userId ?? null, actor?.role ?? null))) {
      return reply.code(403).send({ message: "You do not have access to this version" });
    }

    return personaVersionResponseSchema.parse({
      id: version.id,
      personaId: version.personaId,
      versionNumber: version.versionNumber,
      status: version.status,
      profileJson: version.profileJson,
      previewIntro: version.previewIntro,
      recommendedQuestions: version.recommendedQuestions,
      sampleAnswers: version.sampleAnswers,
      coverageScore: version.coverageScore,
      groundingScore: version.groundingScore,
      styleScore: version.styleScore,
      riskScore: version.riskScore,
    });
  });

  app.post<{ Params: { personaVersionId: string } }>(
    "/v1/persona-versions/:personaVersionId/submit-publish-review",
    async (request, reply) => {
      const actor = requireActorSession(request, reply);
      if (!actor) {
        return reply;
      }

      const targetVersion = await getPersonaVersion(request.params.personaVersionId);
      if (!targetVersion) {
        return reply.code(404).send({ message: "Version not found" });
      }

      if (!(await canManagePersona(targetVersion.personaId, actor.userId, actor.role))) {
        return reply.code(403).send({ message: "You do not have access to this version" });
      }

      const version = await submitPublishReview(request.params.personaVersionId);
      if (!version) {
        return reply.code(404).send({ message: "Version not found" });
      }

      return personaVersionResponseSchema.parse({
        id: version.id,
        personaId: version.personaId,
        versionNumber: version.versionNumber,
        status: version.status,
        profileJson: version.profileJson,
        previewIntro: version.previewIntro,
        recommendedQuestions: version.recommendedQuestions,
        sampleAnswers: version.sampleAnswers,
        coverageScore: version.coverageScore,
        groundingScore: version.groundingScore,
        styleScore: version.styleScore,
        riskScore: version.riskScore,
      });
    },
  );

  app.post<{ Params: { personaVersionId: string } }>("/v1/persona-versions/:personaVersionId/publish", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const targetVersion = await getPersonaVersion(request.params.personaVersionId);
    if (!targetVersion) {
      return reply.code(404).send({ message: "Version not found" });
    }

    if (!(await canManagePersona(targetVersion.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this version" });
    }

    try {
      const input = publishPersonaVersionSchema.parse(request.body ?? {});
      const result = await publishPersonaVersion(request.params.personaVersionId, input.visibility);
      if (!result) {
        return reply.code(404).send({ message: "Version not found" });
      }

      return publishPersonaVersionResponseSchema.parse({
        personaVersionId: result.version.id,
        status: result.version.status,
        visibility: input.visibility,
        personaStatus: result.persona.status,
        listingStatus: result.persona.listingStatus,
        share: result.share,
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Unable to publish version",
      });
    }
  });

  app.post<{ Params: { personaVersionId: string } }>("/v1/persona-versions/:personaVersionId/shares", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const targetVersion = await getPersonaVersion(request.params.personaVersionId);
    if (!targetVersion) {
      return reply.code(404).send({ message: "Version not found" });
    }

    if (!(await canManagePersona(targetVersion.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this version" });
    }

    createShareSchema.parse(request.body ?? {});
    try {
      const share = await createShareForVersion(request.params.personaVersionId);
      if (!share) {
        return reply.code(404).send({ message: "Version not found" });
      }

      return shareLinkResponseSchema.parse(share);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Unable to create share",
      });
    }
  });
};
