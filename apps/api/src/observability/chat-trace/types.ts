import type { z } from "zod";

import {
  chatTraceArtifactSchema,
  chatTraceCaptureLevelSchema,
  chatTraceDetailResponseSchema,
  chatTraceEventSchema,
  chatTraceStatusSchema,
  chatTraceSummarySchema,
} from "@hall-of-fame/contracts";

export type ChatTraceStatus = z.infer<typeof chatTraceStatusSchema>;
export type ChatTraceCaptureLevel = z.infer<typeof chatTraceCaptureLevelSchema>;
export type ChatTraceSummary = z.infer<typeof chatTraceSummarySchema>;
export type ChatTraceEvent = z.infer<typeof chatTraceEventSchema>;
export type ChatTraceArtifact = z.infer<typeof chatTraceArtifactSchema>;
export type ChatTraceDetail = z.infer<typeof chatTraceDetailResponseSchema>;

export type ChatTraceRecordInput = {
  trace: ChatTraceSummary;
  events: ChatTraceEvent[];
  artifacts: ChatTraceArtifact[];
};

export type ChatTraceStdoutLogger = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
};
