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
  buildPersonaVersionResponse,
  canAccessPersonaVersion,
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
import { getActorSession, requireActorSession } from "../../utils/actor-session.js";

export const isLegacySyncPersonaManageEnabled = () => {
  const flag = process.env.LEGACY_SYNC_PERSONA_MANAGE_ENABLED;
  if (flag === "true") {
    return true;
  }
  if (flag === "false") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
};

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
    const actor = getActorSession(request);
    const versions = await listPersonaVersions(request.params.personaId);
    const visibleVersions: Array<(typeof versions)[number]> = [];
    for (const version of versions) {
      if (await canAccessPersonaVersion(version.id, actor?.userId ?? null, actor?.role ?? null)) {
        visibleVersions.push(version);
      }
    }

    return personaVersionListResponseSchema.parse({
      items: await Promise.all(
        visibleVersions.map(async (version) =>
          personaVersionResponseSchema.parse(await buildPersonaVersionResponse(version, actor?.userId ?? null, actor?.role ?? null)),
        ),
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

    if (!isLegacySyncPersonaManageEnabled()) {
      return reply.code(410).send({
        message: "这个旧资料接口已停用，请使用新的资料补充流程。",
      });
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

    if (!isLegacySyncPersonaManageEnabled()) {
      return reply.code(410).send({
        message: "这个旧蒸馏接口已停用，请使用新的创建流程。",
      });
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
      return personaVersionResponseSchema.parse(await buildPersonaVersionResponse(result.version, actor.userId, actor.role));
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
