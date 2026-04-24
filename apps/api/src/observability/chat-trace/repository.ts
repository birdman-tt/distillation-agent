import {
  chatTraceDetailResponseSchema,
  chatTraceListResponseSchema,
  chatTraceSummarySchema,
} from "@hall-of-fame/contracts";
import type { JSONValue } from "postgres";

import { getSql, withTransaction } from "../../db/client.js";
import type { ChatTraceRecordInput } from "./types.js";

export const persistChatTraceRecord = async (input: ChatTraceRecordInput) => {
  await withTransaction(async (sql) => {
    await sql`
      insert into chat_turn_traces (
        turn_trace_id,
        request_id,
        chat_id,
        user_id,
        persona_id,
        persona_version_id,
        message_id,
        assistant_message_id,
        capture_level,
        status,
        started_at,
        completed_at,
        total_duration_ms,
        trace_schema_version,
        chat_workflow_version,
        memory_search_version,
        prompt_template_version,
        normalization_version,
        model_provider,
        model_name,
        temperature,
        max_tokens,
        fallback_used,
        error_message
      ) values (
        ${input.trace.turnTraceId},
        ${input.trace.requestId},
        ${input.trace.chatId}::uuid,
        ${input.trace.userId}::uuid,
        ${input.trace.personaId}::uuid,
        ${input.trace.personaVersionId}::uuid,
        ${input.trace.messageId}::uuid,
        ${input.trace.assistantMessageId}::uuid,
        ${input.trace.captureLevel},
        ${input.trace.status},
        ${input.trace.startedAt},
        ${input.trace.completedAt},
        ${input.trace.totalDurationMs},
        ${input.trace.traceSchemaVersion},
        ${input.trace.chatWorkflowVersion},
        ${input.trace.memorySearchVersion},
        ${input.trace.promptTemplateVersion},
        ${input.trace.normalizationVersion},
        ${input.trace.modelProvider},
        ${input.trace.modelName},
        ${input.trace.temperature},
        ${input.trace.maxTokens},
        ${input.trace.fallbackUsed},
        ${input.trace.errorMessage}
      )
      on conflict (turn_trace_id) do update
        set request_id = excluded.request_id,
            chat_id = excluded.chat_id,
            user_id = excluded.user_id,
            persona_id = excluded.persona_id,
            persona_version_id = excluded.persona_version_id,
            message_id = excluded.message_id,
            assistant_message_id = excluded.assistant_message_id,
            capture_level = excluded.capture_level,
            status = excluded.status,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            total_duration_ms = excluded.total_duration_ms,
            trace_schema_version = excluded.trace_schema_version,
            chat_workflow_version = excluded.chat_workflow_version,
            memory_search_version = excluded.memory_search_version,
            prompt_template_version = excluded.prompt_template_version,
            normalization_version = excluded.normalization_version,
            model_provider = excluded.model_provider,
            model_name = excluded.model_name,
            temperature = excluded.temperature,
            max_tokens = excluded.max_tokens,
            fallback_used = excluded.fallback_used,
            error_message = excluded.error_message
    `;

    await sql`delete from chat_turn_trace_events where turn_trace_id = ${input.trace.turnTraceId}`;
    await sql`delete from chat_turn_trace_artifacts where turn_trace_id = ${input.trace.turnTraceId}`;

    for (const event of input.events) {
      await sql`
        insert into chat_turn_trace_events (
          turn_trace_id,
          seq,
          event_name,
          stage,
          status,
          level,
          at,
          duration_ms,
          fields,
          artifact_refs
        ) values (
          ${input.trace.turnTraceId},
          ${event.seq},
          ${event.eventName},
          ${event.stage},
          ${event.status},
          ${event.level},
          ${event.at},
          ${event.durationMs},
          ${sql.json(event.fields as JSONValue)},
          ${sql.json(event.artifactRefs as JSONValue)}
        )
      `;
    }

    for (const artifact of input.artifacts) {
      await sql`
        insert into chat_turn_trace_artifacts (
          turn_trace_id,
          artifact_key,
          content_type,
          storage_kind,
          text_value,
          json_value,
          created_at
        ) values (
          ${input.trace.turnTraceId},
          ${artifact.artifactKey},
          ${artifact.contentType},
          ${artifact.storageKind},
          ${artifact.textValue},
          ${artifact.jsonValue ? sql.json(artifact.jsonValue as JSONValue) : null},
          ${artifact.createdAt}
        )
      `;
    }
  });
};

export const getChatTraceDetail = async (turnTraceId: string) => {
  const sql = getSql();
  const traceRows = await sql<{
    turnTraceId: string;
    requestId: string;
    chatId: string;
    userId: string | null;
    personaId: string | null;
    personaVersionId: string;
    messageId: string | null;
    assistantMessageId: string | null;
    captureLevel: "full" | "metadata-only";
    status: "running" | "success" | "fallback_success" | "failed";
    startedAt: Date;
    completedAt: Date | null;
    totalDurationMs: number | null;
    traceSchemaVersion: string;
    chatWorkflowVersion: string;
    memorySearchVersion: string;
    promptTemplateVersion: string;
    normalizationVersion: string;
    modelProvider: string | null;
    modelName: string | null;
    temperature: number | null;
    maxTokens: number | null;
    fallbackUsed: boolean;
    errorMessage: string | null;
  }[]>`
    select
      turn_trace_id as "turnTraceId",
      request_id as "requestId",
      chat_id as "chatId",
      user_id as "userId",
      persona_id as "personaId",
      persona_version_id as "personaVersionId",
      message_id as "messageId",
      assistant_message_id as "assistantMessageId",
      capture_level as "captureLevel",
      status,
      started_at as "startedAt",
      completed_at as "completedAt",
      total_duration_ms as "totalDurationMs",
      trace_schema_version as "traceSchemaVersion",
      chat_workflow_version as "chatWorkflowVersion",
      memory_search_version as "memorySearchVersion",
      prompt_template_version as "promptTemplateVersion",
      normalization_version as "normalizationVersion",
      model_provider as "modelProvider",
      model_name as "modelName",
      temperature,
      max_tokens as "maxTokens",
      fallback_used as "fallbackUsed",
      error_message as "errorMessage"
    from chat_turn_traces
    where turn_trace_id = ${turnTraceId}
    limit 1
  `;
  const trace = traceRows[0];
  if (!trace) {
    return null;
  }

  const eventRows = await sql<{
    seq: number;
    eventName: string;
    stage: string;
    status: string;
    level: "info" | "warn" | "error";
    at: Date;
    durationMs: number | null;
    fields: Record<string, unknown>;
    artifactRefs: Array<{ artifactKey: string }>;
  }[]>`
    select
      seq,
      event_name as "eventName",
      stage,
      status,
      level,
      at,
      duration_ms as "durationMs",
      fields,
      artifact_refs as "artifactRefs"
    from chat_turn_trace_events
    where turn_trace_id = ${turnTraceId}
    order by seq asc
  `;

  const artifactRows = await sql<{
    artifactKey: string;
    contentType: string;
    storageKind: "inline";
    textValue: string | null;
    jsonValue: unknown | null;
    createdAt: Date;
  }[]>`
    select
      artifact_key as "artifactKey",
      content_type as "contentType",
      storage_kind as "storageKind",
      text_value as "textValue",
      json_value as "jsonValue",
      created_at as "createdAt"
    from chat_turn_trace_artifacts
    where turn_trace_id = ${turnTraceId}
    order by artifact_key asc
  `;

  return chatTraceDetailResponseSchema.parse({
    trace: {
      ...trace,
      startedAt: trace.startedAt.toISOString(),
      completedAt: trace.completedAt ? trace.completedAt.toISOString() : null,
      eventCount: eventRows.length,
    },
    events: eventRows.map((row) => ({
      ...row,
      at: row.at.toISOString(),
    })),
    artifacts: artifactRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  });
};

export const listChatTracesByChatId = async (input: {
  chatId: string;
  limit?: number;
}) => {
  const sql = getSql();
  const rows = await sql<{
    turnTraceId: string;
    requestId: string;
    chatId: string;
    userId: string | null;
    personaId: string | null;
    personaVersionId: string;
    messageId: string | null;
    assistantMessageId: string | null;
    captureLevel: "full" | "metadata-only";
    status: "running" | "success" | "fallback_success" | "failed";
    startedAt: Date;
    completedAt: Date | null;
    totalDurationMs: number | null;
    traceSchemaVersion: string;
    chatWorkflowVersion: string;
    memorySearchVersion: string;
    promptTemplateVersion: string;
    normalizationVersion: string;
    modelProvider: string | null;
    modelName: string | null;
    temperature: number | null;
    maxTokens: number | null;
    fallbackUsed: boolean;
    errorMessage: string | null;
    eventCount: number;
  }[]>`
    select
      t.turn_trace_id as "turnTraceId",
      t.request_id as "requestId",
      t.chat_id as "chatId",
      t.user_id as "userId",
      t.persona_id as "personaId",
      t.persona_version_id as "personaVersionId",
      t.message_id as "messageId",
      t.assistant_message_id as "assistantMessageId",
      t.capture_level as "captureLevel",
      t.status,
      t.started_at as "startedAt",
      t.completed_at as "completedAt",
      t.total_duration_ms as "totalDurationMs",
      t.trace_schema_version as "traceSchemaVersion",
      t.chat_workflow_version as "chatWorkflowVersion",
      t.memory_search_version as "memorySearchVersion",
      t.prompt_template_version as "promptTemplateVersion",
      t.normalization_version as "normalizationVersion",
      t.model_provider as "modelProvider",
      t.model_name as "modelName",
      t.temperature,
      t.max_tokens as "maxTokens",
      t.fallback_used as "fallbackUsed",
      t.error_message as "errorMessage",
      count(e.id)::int as "eventCount"
    from chat_turn_traces t
    left join chat_turn_trace_events e on e.turn_trace_id = t.turn_trace_id
    where t.chat_id = ${input.chatId}::uuid
    group by t.turn_trace_id
    order by t.started_at desc, t.turn_trace_id desc
    limit ${input.limit ?? 50}
  `;

  return chatTraceListResponseSchema.parse({
    items: rows.map((row) =>
      chatTraceSummarySchema.parse({
        ...row,
        startedAt: row.startedAt.toISOString(),
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      })),
  });
};
