import {
  CHAT_MEMORY_SEARCH_VERSION,
  CHAT_NORMALIZATION_VERSION,
  CHAT_PROMPT_TEMPLATE_VERSION,
  CHAT_TRACE_SCHEMA_VERSION,
  CHAT_WORKFLOW_VERSION,
} from "./config.js";
import type {
  ChatTraceArtifact,
  ChatTraceCaptureLevel,
  ChatTraceEvent,
  ChatTraceRecordInput,
  ChatTraceStatus,
  ChatTraceStdoutLogger,
  ChatTraceSummary,
} from "./types.js";

const normalizeJson = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeJson(item)]));
  }
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value;
};

export class ChatTraceCollector {
  private readonly logger: ChatTraceStdoutLogger;
  private readonly startedAt = Date.now();
  private readonly events: ChatTraceEvent[] = [];
  private readonly artifacts = new Map<string, ChatTraceArtifact>();
  private nextSeq = 1;
  private readonly trace: ChatTraceSummary;

  constructor(input: {
    logger: ChatTraceStdoutLogger;
    turnTraceId: string;
    requestId: string;
    chatId: string;
    userId: string | null;
    personaId: string | null;
    personaVersionId: string;
    captureLevel: ChatTraceCaptureLevel;
    modelProvider: string | null;
    modelName: string | null;
    temperature: number | null;
    maxTokens: number | null;
  }) {
    this.logger = input.logger;
    this.trace = {
      turnTraceId: input.turnTraceId,
      requestId: input.requestId,
      chatId: input.chatId,
      userId: input.userId,
      personaId: input.personaId,
      personaVersionId: input.personaVersionId,
      messageId: null,
      assistantMessageId: null,
      captureLevel: input.captureLevel,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalDurationMs: null,
      traceSchemaVersion: CHAT_TRACE_SCHEMA_VERSION,
      chatWorkflowVersion: CHAT_WORKFLOW_VERSION,
      memorySearchVersion: CHAT_MEMORY_SEARCH_VERSION,
      promptTemplateVersion: CHAT_PROMPT_TEMPLATE_VERSION,
      normalizationVersion: CHAT_NORMALIZATION_VERSION,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      fallbackUsed: false,
      errorMessage: null,
      eventCount: 0,
    };
  }

  setMessageId(messageId: string | null) {
    this.trace.messageId = messageId;
  }

  setAssistantMessageId(messageId: string | null) {
    this.trace.assistantMessageId = messageId;
  }

  markFallbackUsed() {
    this.trace.fallbackUsed = true;
  }

  setErrorMessage(errorMessage: string | null) {
    this.trace.errorMessage = errorMessage;
  }

  addTextArtifact(artifactKey: string, textValue: string, contentType = "text/plain") {
    if (this.trace.captureLevel !== "full") {
      return null;
    }

    const artifact: ChatTraceArtifact = {
      artifactKey,
      contentType,
      storageKind: "inline",
      textValue,
      jsonValue: null,
      createdAt: new Date().toISOString(),
    };
    this.artifacts.set(artifactKey, artifact);
    return { artifactKey };
  }

  addJsonArtifact(artifactKey: string, jsonValue: unknown, contentType = "application/json") {
    if (this.trace.captureLevel !== "full") {
      return null;
    }

    const artifact: ChatTraceArtifact = {
      artifactKey,
      contentType,
      storageKind: "inline",
      textValue: null,
      jsonValue: normalizeJson(jsonValue) ?? null,
      createdAt: new Date().toISOString(),
    };
    this.artifacts.set(artifactKey, artifact);
    return { artifactKey };
  }

  recordEvent(input: {
    eventName: string;
    stage: string;
    status: string;
    level?: ChatTraceEvent["level"];
    durationMs?: number | null;
    fields?: Record<string, unknown>;
    artifactRefs?: Array<{ artifactKey: string } | null | undefined>;
  }) {
    const event: ChatTraceEvent = {
      seq: this.nextSeq++,
      eventName: input.eventName,
      stage: input.stage,
      status: input.status,
      level: input.level ?? "info",
      at: new Date().toISOString(),
      durationMs: input.durationMs ?? null,
      fields: normalizeJson(input.fields ?? {}) as Record<string, unknown>,
      artifactRefs: (input.artifactRefs ?? []).filter((item): item is { artifactKey: string } => Boolean(item)),
    };
    this.events.push(event);
    this.trace.eventCount = this.events.length;

    const payload = {
      kind: "chat_trace_event",
      turnTraceId: this.trace.turnTraceId,
      chatId: this.trace.chatId,
      eventName: event.eventName,
      stage: event.stage,
      status: event.status,
      fields: event.fields,
    };
    if (event.level === "error") {
      this.logger.error(payload, "[chat-trace] event");
    } else if (event.level === "warn") {
      this.logger.warn(payload, "[chat-trace] event");
    } else {
      this.logger.info(payload, "[chat-trace] event");
    }
  }

  finalize(status: ChatTraceStatus) {
    this.trace.status = status;
    this.trace.completedAt = new Date().toISOString();
    this.trace.totalDurationMs = Date.now() - this.startedAt;

    this.logger.info(
      {
        kind: "chat_trace_summary",
        turnTraceId: this.trace.turnTraceId,
        chatId: this.trace.chatId,
        status: this.trace.status,
        fallbackUsed: this.trace.fallbackUsed,
        totalDurationMs: this.trace.totalDurationMs,
      },
      "[chat-trace] summary",
    );
  }

  toRecordInput(): ChatTraceRecordInput {
    return {
      trace: { ...this.trace },
      events: [...this.events],
      artifacts: [...this.artifacts.values()],
    };
  }
}
