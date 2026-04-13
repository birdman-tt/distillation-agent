import {
  workerDistillRequestSchema,
  workerDistillResponseSchema,
  workerSourceIngestRequestSchema,
  workerSourceIngestResponseSchema,
} from "@hall-of-fame/contracts";

const readWorkerBaseUrl = () => process.env.WORKER_BASE_URL ?? "http://127.0.0.1:3001";

const requestWorkerJson = async <T>(path: string, payload: unknown, parse: (input: unknown) => T) => {
  const response = await fetch(`${readWorkerBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    const errorMessage =
      typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : `Worker request failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  return parse(body);
};

export const ingestUrlSourceViaWorker = async (payload: unknown) => {
  const input = workerSourceIngestRequestSchema.parse(payload);
  return requestWorkerJson("/internal/source-ingest", input, workerSourceIngestResponseSchema.parse);
};

export const distillPersonaViaWorker = async (payload: unknown) => {
  const input = workerDistillRequestSchema.parse(payload);
  return requestWorkerJson("/internal/distill", input, workerDistillResponseSchema.parse);
};
