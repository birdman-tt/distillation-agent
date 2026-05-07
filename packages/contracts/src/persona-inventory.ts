import { z } from "zod";

export const myObjectStatusSchema = z.enum(["CREATING", "NEEDS_SOURCES", "PENDING_CONFIRM", "READY", "PUBLIC", "FAILED", "DELETED"]);

export const myObjectActionSchema = z.enum(["CHAT", "EDIT", "ADD_SOURCES", "DELETE", "CONFIRM", "PUBLISH", "SHARE", "RETRY"]);

export const myObjectPrimaryActionSchema = z.enum(["VIEW_PROGRESS", "ADD_SOURCES", "OPEN_DETAIL", "CHAT", "RETRY"]);

export const personaInventoryItemSchema = z.object({
  objectId: z.string().uuid(),
  personaId: z.string().uuid().nullable(),
  personaVersionId: z.string().uuid().nullable(),
  sourceDistillJobId: z.string().uuid().nullable(),
  displayName: z.string(),
  intro: z.string().nullable(),
  status: myObjectStatusSchema,
  updatedAt: z.string(),
  primaryAction: myObjectPrimaryActionSchema,
  primaryHref: z.string(),
  availableActions: z.array(myObjectActionSchema),
});

export const personaInventoryResponseSchema = z.object({
  groups: z.object({
    creating: z.array(personaInventoryItemSchema),
    needsAttention: z.array(personaInventoryItemSchema),
    ready: z.array(personaInventoryItemSchema),
    public: z.array(personaInventoryItemSchema),
  }),
  items: z.array(personaInventoryItemSchema),
});

export const discardPersonaVersionResponseSchema = z.object({
  personaVersionId: z.string().uuid(),
  status: z.literal("REJECTED"),
});
