import { readFile } from "node:fs/promises";

import { chatTraceListResponseSchema } from "@hall-of-fame/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { isChatTraceDebugEnabled, readChatTraceDebugToken } from "../../observability/chat-trace/config.js";
import { getChatTraceDetail, listChatTracesByChatId } from "../../observability/chat-trace/repository.js";

const viewerRoot = new URL("../../../../../tools/chat-trace-viewer/", import.meta.url);
const viewerAssetCache = new Map<string, Promise<string>>();

const requireChatTraceViewerAccess = (_request: FastifyRequest, reply: FastifyReply) => {
  if (!isChatTraceDebugEnabled()) {
    void reply.code(404).send({ message: "Not found" });
    return false;
  }

  return true;
};

const requireChatTraceDebugAccess = (request: FastifyRequest, reply: FastifyReply) => {
  if (!requireChatTraceViewerAccess(request, reply)) {
    return false;
  }

  const token = readChatTraceDebugToken();
  if (!token) {
    return true;
  }

  const provided = request.headers["x-internal-debug-key"];
  if (provided === token) {
    return true;
  }

  void reply.code(403).send({ message: "Forbidden" });
  return false;
};

const readViewerAsset = (filename: string) => {
  if (!viewerAssetCache.has(filename)) {
    viewerAssetCache.set(filename, readFile(new URL(filename, viewerRoot), "utf8"));
  }

  return viewerAssetCache.get(filename)!;
};

export const internalChatTracesRoute: FastifyPluginAsync = async (app) => {
  app.get("/internal/debug/chat-traces/viewer", async (request, reply) => {
    if (!requireChatTraceViewerAccess(request, reply)) {
      return;
    }

    return reply.type("text/html; charset=utf-8").send(await readViewerAsset("index.html"));
  });

  app.get("/internal/debug/chat-traces/viewer.css", async (request, reply) => {
    if (!requireChatTraceViewerAccess(request, reply)) {
      return;
    }

    return reply.type("text/css; charset=utf-8").send(await readViewerAsset("viewer.css"));
  });

  app.get("/internal/debug/chat-traces/viewer.js", async (request, reply) => {
    if (!requireChatTraceViewerAccess(request, reply)) {
      return;
    }

    return reply.type("application/javascript; charset=utf-8").send(await readViewerAsset("viewer.js"));
  });

  app.get<{ Params: { turnTraceId: string } }>("/internal/debug/chat-traces/:turnTraceId", async (request, reply) => {
    if (!requireChatTraceDebugAccess(request, reply)) {
      return;
    }

    const trace = await getChatTraceDetail(request.params.turnTraceId);
    if (!trace) {
      return reply.code(404).send({
        message: "Trace not found",
      });
    }

    return trace;
  });

  app.get<{ Querystring: { chatId?: string } }>("/internal/debug/chat-traces", async (request, reply) => {
    if (!requireChatTraceDebugAccess(request, reply)) {
      return;
    }

    if (!request.query.chatId) {
      return reply.code(400).send({
        message: "chatId is required",
      });
    }

    return chatTraceListResponseSchema.parse(
      await listChatTracesByChatId({
        chatId: request.query.chatId,
      }),
    );
  });
};
