import { sanitizeDistillToolTraceJson } from "@hall-of-fame/contracts";

export type DistillLogger = Partial<
  Record<"info" | "warn" | "error" | "debug", (fields: Record<string, unknown>, message: string) => void>
>;

type DistillLogLevel = "info" | "warn" | "error" | "debug";

const sanitizeLogFields = (fields: Record<string, unknown>) => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    sanitized[key] =
      key === "input" || key === "output" || key === "artifact" || key === "errorMessage"
        ? sanitizeDistillToolTraceJson(value)
        : value;
  }
  return sanitized;
};

export const logDistillEvent = (
  logger: DistillLogger | null | undefined,
  level: DistillLogLevel,
  kind: string,
  fields: Record<string, unknown> = {},
) => {
  try {
    const log = logger?.[level];
    if (!log) {
      return;
    }
    log.call(
      logger,
      {
        kind,
        ...sanitizeLogFields(fields),
      },
      kind,
    );
  } catch {
    // Observability must never affect distill job execution.
  }
};
