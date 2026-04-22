import type { WorkflowEvent } from "./events.js";

export const createWorkflowObserver = (workflow: WorkflowEvent["workflow"]) => {
  const emit = (step: string, status: WorkflowEvent["status"], detail?: Record<string, unknown>) => {
    const event: WorkflowEvent = {
      workflow,
      step,
      status,
      at: new Date().toISOString(),
      detail,
    };
    console.log(`[worker:${event.workflow}] ${event.step} ${event.status}`, JSON.stringify(event.detail ?? {}));
    return event;
  };

  return {
    started: (step: string, detail?: Record<string, unknown>) => emit(step, "started", detail),
    completed: (step: string, detail?: Record<string, unknown>) => emit(step, "completed", detail),
    failed: (step: string, detail?: Record<string, unknown>) => emit(step, "failed", detail),
  };
};
