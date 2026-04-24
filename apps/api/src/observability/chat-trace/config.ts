export const CHAT_TRACE_SCHEMA_VERSION = "v1";
export const CHAT_WORKFLOW_VERSION = "v1";
export const CHAT_MEMORY_SEARCH_VERSION = "v1";
export const CHAT_PROMPT_TEMPLATE_VERSION = "v1";
export const CHAT_NORMALIZATION_VERSION = "v1";

export const readChatTraceCaptureLevel = () => {
  const configured = process.env.CHAT_TRACE_CAPTURE_LEVEL?.trim().toLowerCase();
  if (configured === "metadata-only") {
    return "metadata-only" as const;
  }

  return "full" as const;
};

export const isChatTraceDebugEnabled = () => {
  if (process.env.CHAT_TRACE_INTERNAL_ENABLED) {
    return process.env.CHAT_TRACE_INTERNAL_ENABLED === "true";
  }

  return process.env.NODE_ENV !== "production";
};

export const readChatTraceDebugToken = () => {
  const value = process.env.CHAT_TRACE_INTERNAL_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
};
