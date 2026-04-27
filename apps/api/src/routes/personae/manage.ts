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

import { enqueuePersonaVersionEmbeddings } from "../../services/embeddings/persona-embedding-scheduler.js";
import { distillPersonaViaWorker, ingestUrlSourceViaWorker } from "../../services/worker-client.js";
import {
    canManagePersona,
    createPersona,
    createTextSource,
    createUrlSource,
    getPersonaDetail,
    getPersonaStatus,
    listPersonaSources,
  listPersonaVersions,
  persistDistilledVersion,
  persistUrlSourceIngestResult,
  prepareDistillInput,
  updatePersona,
} from "../../store/persona-store.js";
import { requireActorSession } from "../../utils/actor-session.js";

export const personaeManageRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/personae", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const input = createPersonaSchema.parse(request.body);
    const { persona } = await createPersona({
      ...input,
      creatorUserId: actor.userId,
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
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    if (!(await canManagePersona(request.params.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this persona" });
    }

    const input = updatePersonaSchema.parse(request.body);
    const updated = await updatePersona(request.params.personaId, input);
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
    const status = await getPersonaStatus(request.params.personaId);
    if (!status) {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return {
      personaId: status.personaId,
      status: status.status,
      currentPublishedVersionId: status.currentPublishedVersionId,
    };
  });

  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId/versions", async (request) => {
    return personaVersionListResponseSchema.parse({
      items: (await listPersonaVersions(request.params.personaId)).map((version) =>
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
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    if (!(await canManagePersona(request.params.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this persona" });
    }

    const input = createTextSourceSchema.parse(request.body);
    const source = await createTextSource(request.params.personaId, {
      ...input,
      submittedByUserId: actor.userId,
    });
    if (!source) {
      return reply.code(404).send({ message: "Persona not found" });
    }

    return source;
  });

  app.post<{ Params: { personaId: string } }>("/v1/personae/:personaId/sources/url", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    if (!(await canManagePersona(request.params.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this persona" });
    }

    try {
      const input = createUrlSourceSchema.parse(request.body);
      const source = await createUrlSource(request.params.personaId, {
        ...input,
        submittedByUserId: actor.userId,
      });
      if (!source) {
        return reply.code(404).send({ message: "Persona not found" });
      }

      const ingestResult = await ingestUrlSourceViaWorker(input);
      await persistUrlSourceIngestResult(source.id, ingestResult);
      return source;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Invalid URL source",
      });
    }
  });

  app.get<{ Params: { personaId: string } }>("/v1/personae/:personaId/sources", async (request, reply) => {
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    const detail = await getPersonaDetail(request.params.personaId);
    if (!detail || detail.persona.originType === "OFFICIAL") {
      return reply.code(404).send({ message: "Persona not found" });
    }

    if (!(await canManagePersona(request.params.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this persona" });
    }

    return listSourcesResponseSchema.parse({
      items: (await listPersonaSources(request.params.personaId)).map((source) => ({
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
    const actor = requireActorSession(request, reply);
    if (!actor) {
      return reply;
    }

    if (!(await canManagePersona(request.params.personaId, actor.userId, actor.role))) {
      return reply.code(403).send({ message: "You do not have access to this persona" });
    }

    try {
      const prepared = await prepareDistillInput(request.params.personaId);
      if (!prepared) {
        return reply.code(404).send({ message: "Persona not found" });
      }
      const distilled = await distillPersonaViaWorker(prepared);
      const result = await persistDistilledVersion(request.params.personaId, actor.userId, distilled);
      if (!result) {
        return reply.code(404).send({ message: "Persona not found" });
      }
      enqueuePersonaVersionEmbeddings(
        {
          version: {
            id: result.version.id,
            personaId: result.version.personaId,
            profileJson: result.version.profileJson,
            previewIntro: result.version.previewIntro,
            sampleAnswers: result.version.sampleAnswers,
            recommendedQuestions: result.version.recommendedQuestions,
          },
        },
        {
          logger: request.log,
        },
      );
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
