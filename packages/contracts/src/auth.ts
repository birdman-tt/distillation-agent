import { z } from "zod";

export const actorRoleSchema = z.enum(["ANONYMOUS", "USER", "REVIEWER"]);
export const sessionKindSchema = z.enum(["ANONYMOUS", "AUTHENTICATED"]);

export const requestSmsCodeSchema = z.object({
  phoneNumber: z.string().min(1),
});

export const verifySmsCodeSchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().length(6),
});

export const wechatMiniappLoginSchema = z.object({
  code: z.string().min(1),
});

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1),
});

export const issueAnonymousSessionSchema = z.object({
  deviceId: z.string().min(1).optional(),
});

export const authSessionResponseSchema = z.object({
  userId: z.string().uuid(),
  accessToken: z.string(),
  refreshToken: z.string(),
  role: actorRoleSchema,
  sessionKind: sessionKindSchema,
});
