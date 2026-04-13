import {
  authSessionResponseSchema,
  refreshSessionSchema,
  requestSmsCodeSchema,
  verifySmsCodeSchema,
  wechatMiniappLoginSchema,
} from "@hall-of-fame/contracts";
import type { FastifyPluginAsync } from "fastify";

import { refreshSession, verifySmsIdentity, verifyWechatIdentity } from "../store/auth-store.js";
import { enforceWindowRateLimit } from "../utils/rate-limit.js";

export const authRoute: FastifyPluginAsync = async (app) => {
  app.post("/v1/auth/web/sms/request", async (request, reply) => {
    const limit = enforceWindowRateLimit({
      key: `sms:${request.ip || "unknown"}`,
      limit: 5,
      windowMs: 10 * 60_000,
    });
    if (!limit.allowed) {
      return reply.code(429).send({
        message: "Too many SMS requests, please retry later.",
        retryAfterMs: limit.retryAfterMs,
      });
    }

    const input = requestSmsCodeSchema.parse(request.body);
    return {
      ok: true,
      requestId: `smsreq_${input.phoneNumber.slice(-4)}`,
    };
  });

  app.post("/v1/auth/web/sms/verify", async (request) => {
    const input = verifySmsCodeSchema.parse(request.body);
    const session = verifySmsIdentity(input.phoneNumber);
    return authSessionResponseSchema.parse({
      userId: session.userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  });

  app.post("/v1/auth/wechat-miniapp/login", async (request) => {
    const input = wechatMiniappLoginSchema.parse(request.body);
    const session = verifyWechatIdentity(input.code);
    return authSessionResponseSchema.parse({
      userId: session.userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const input = refreshSessionSchema.parse(request.body);
    const session = refreshSession(input.refreshToken);
    if (!session) {
      return reply.code(401).send({ message: "Invalid refresh token" });
    }

    return authSessionResponseSchema.parse({
      userId: session.userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  });
};
