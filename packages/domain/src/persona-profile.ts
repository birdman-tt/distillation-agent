import { z } from "zod";

export const personaProfileSchema = z.object({
  summary: z.string(),
  roles: z.array(z.string()).default([]),
  coreBeliefs: z.array(z.string()).default([]),
  reasoningPatterns: z.array(z.string()).default([]),
  speakingStyle: z.array(z.string()).default([]),
  signaturePhrases: z.array(z.string()).default([]),
  topicStrengths: z.array(z.string()).default([]),
  topicUnknowns: z.array(z.string()).default([]),
  taboosOrBoundaries: z.array(z.string()).default([]),
});

export type PersonaProfile = z.infer<typeof personaProfileSchema>;
