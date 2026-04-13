export type WorkflowEventStatus = "started" | "completed" | "failed";

export type WorkflowEvent = {
  workflow: "source-ingest" | "distill";
  step: string;
  status: WorkflowEventStatus;
  at: string;
  detail?: Record<string, unknown>;
};
