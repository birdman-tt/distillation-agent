import { z } from "zod";

import { myObjectActionSchema, myObjectPrimaryActionSchema, myObjectStatusSchema } from "./persona-inventory.js";

export const myObjectEditableFieldSchema = z.enum(["displayName", "intro"]);

export const myObjectShareSummarySchema = z.object({
  shareHref: z.string(),
  canonicalUrl: z.string().url(),
  miniappPath: z.string(),
});

export const myObjectDetailSchema = z.object({
  objectId: z.string().uuid(),
  displayName: z.string(),
  intro: z.string().nullable(),
  status: myObjectStatusSchema,
  updatedAt: z.string(),
  primaryAction: myObjectPrimaryActionSchema,
  primaryHref: z.string(),
  availableActions: z.array(myObjectActionSchema),
  chatHref: z.string().nullable(),
  addSourcesHref: z.string().nullable(),
  shareHref: z.string().nullable(),
  editableFields: z.array(myObjectEditableFieldSchema),
  userMessage: z.string().nullable(),
});

export const updateMyObjectSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  intro: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional(),
});

export const myObjectActionResponseSchema = z.object({
  object: myObjectDetailSchema,
  share: myObjectShareSummarySchema.nullable(),
  message: z.string(),
});

export const deleteMyObjectResponseSchema = z.object({
  objectId: z.string().uuid(),
  deleted: z.literal(true),
  message: z.string(),
});

export const myObjectChatResponseSchema = z.object({
  chatId: z.string().uuid(),
});
