import type { FastifyReply, FastifyRequest } from "fastify";

import {
  getOptionalSessionFromAuthorizationHeader,
  isReviewerSession,
  type SessionRecord,
} from "../store/auth-store.js";

const readAuthorization = (request: FastifyRequest) => request.headers.authorization?.toString();

export const getActorSession = (request: FastifyRequest) =>
  getOptionalSessionFromAuthorizationHeader(readAuthorization(request));

export const requireActorSession = (request: FastifyRequest, reply: FastifyReply): SessionRecord | null => {
  const session = getActorSession(request);
  if (!session) {
    void reply.code(401).send({ message: "Authentication required" });
    return null;
  }

  return session;
};

export const requireReviewerSession = (request: FastifyRequest, reply: FastifyReply): SessionRecord | null => {
  const session = requireActorSession(request, reply);
  if (!session) {
    return null;
  }

  if (!isReviewerSession(session)) {
    void reply.code(403).send({ message: "Reviewer role required" });
    return null;
  }

  return session;
};
