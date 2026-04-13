import { z } from "zod";

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

export const authSessionResponseSchema = z.object({
  userId: z.string().uuid(),
  accessToken: z.string(),
  refreshToken: z.string(),
});
