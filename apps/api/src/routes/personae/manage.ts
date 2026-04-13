import {
  createPersonaSchema,
  createTextSourceSchema,
  createUrlSourceSchema,
  listSourcesResponseSchema,
  personaSummarySchema,
  personaVersionListResponseSchema,
  personaVersionResponseSchema,
  updatePersonaSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { resolveActorUserId } from "../../store/auth-store.js";
import {
  createPersona,
  createTextSource,
  createUrlSource,
  distillPersona,
  getPersonaDetail,
  listPersonaSources,
  listPersonaVersions,
  submitPublishReview,
  updatePersona,
} from "../../store/persona-store.js";

export const personaeManageRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/personae", async (request) => {
    const input = createPersonaSchema.parse(request.body);
    const actorUserId = resolveActorUserId(request.headers["x-user-id"]?.toString());
    const { persona } = createPersona({
      ...input,
      creatorUserId: actorUserId,
    });

    return personaSummarySchema.parse({
      id: persona.id,
      displayName: persona.displayName,
      originType: persona.originType,
      personaType: persona.personaType,
      listingStatus: persona.listingStatus,
      status: persona.status,
      featuredRank: persona.featuredRank,
    });
  });

  app.patch<{ Params: { personaId: string } }>("/v1/personae/:personaId", async (request, reply) => {
    const input = updatePersonaSchema.parse(request.body);
    const updated = updatePersona(request.params.personaId, input);
    if (!updated) {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return personaSummarySchema.parse({
      id: updated.id,
      displayName: updated.displayName,
      originType: updated.originType,
      personaType: updated.personaType,
      listingStatus: updated.listingStatus,
      status: updated.status,
      featuredRank: updated.featuredRank,
    });
  });

  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId/status", async (request, reply) => {
    const detail = getPersonaDetail(request.params.personaId);
    if (!detail) {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return {
      personaId: detail.persona.id,
      status: detail.persona.status,
      currentPublishedVersionId: detail.persona.currentPublishedVersionId,
    };
  });

  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId/versions", async (request) => {
    return personaVersionListResponseSchema.parse({
      items: listPersonaVersions(request.params.personaId).map((version) =>
        personaVersionResponseSchema.parse({
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
        }),
      ),
    });
  });

  app.post<{ Params: { personaId: string } }>("/v1/personae/:personaId/sources/text", async (request, reply) => {
    const input = createTextSourceSchema.parse(request.body);
    const actorUserId = resolveActorUserId(request.headers["x-user-id"]?.toString());
    const source = createTextSource(request.params.personaId, {
      ...input,
      submittedByUserId: actorUserId,
    });
    if (!source) {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return source;
  });

  app.post<{ Params: { personaId: string } }>("/v1/personae/:personaId/sources/url", async (request, reply) => {
    try {
      const input = createUrlSourceSchema.parse(request.body);
      const actorUserId = resolveActorUserId(request.headers["x-user-id"]?.toString());
      const source = createUrlSource(request.params.personaId, {
        ...input,
        submittedByUserId: actorUserId,
      });
      if (!source) {
        return reply.code(404).send({ message: "Persona not found" });
      }
      return source;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Invalid URL source",
      });
    }
  });

  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId/sources", async (request, reply) => {
    const detail = getPersonaDetail(request.params.personaId);
    if (!detail || detail.persona.originType === "OFFICIAL") {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return listSourcesResponseSchema.parse({
      items: listPersonaSources(request.params.personaId).map((source) => ({
        id: source.id,
        personaId: source.personaId,
        inputType: source.inputType,
        reviewStatus: source.reviewStatus,
        sourceUrl: source.sourceUrl,
        sourceTitle: source.sourceTitle,
        sourceAuthor: source.sourceAuthor,
        sourceSummary: source.sourceSummary,
        sourceKind: source.sourceKind,
        createdAt: source.createdAt,
      })),
    });
  });

  app.post<{ Params: { personaId: string } }>("/v1/personae/:personaId/distill", async (request, reply) => {
    const actorUserId = resolveActorUserId(request.headers["x-user-id"]?.toString());
    try {
      const result = distillPersona(request.params.personaId, actorUserId);
      if (!result) {
        return reply.code(404).send({ message: "Persona not found" });
      }
      return personaVersionResponseSchema.parse({
        id: result.version.id,
        personaId: result.version.personaId,
        versionNumber: result.version.versionNumber,
        status: result.version.status,
        profileJson: result.version.profileJson,
        previewIntro: result.version.previewIntro,
        recommendedQuestions: result.version.recommendedQuestions,
        sampleAnswers: result.version.sampleAnswers,
        coverageScore: result.version.coverageScore,
        groundingScore: result.version.groundingScore,
        styleScore: result.version.styleScore,
        riskScore: result.version.riskScore,
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Unable to distill persona",
      });
    }
  });

  app.post<{ Params: { personaId: string } }>("/v1/personae/:personaId/publish", async (request, reply) => {
    void request;
    return reply.code(410).send({
      message: "Use /v1/persona-versions/:personaVersionId/submit-publish-review instead.",
    });
  });
};
