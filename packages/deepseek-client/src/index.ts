export class DeepSeekNotConfiguredError extends Error {
  constructor() {
    super("DeepSeek API key is not configured");
  }
}

export const isDeepSeekConfigured = (apiKey?: string | null) => Boolean(apiKey && apiKey.trim().length > 0);

type DeepSeekThinkingConfig = {
  type: "enabled" | "disabled";
  reasoning_effort?: "high" | "max";
};

export const requestStructuredJson = async <T>(input: {
  apiKey?: string | null;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: {
    parse(data: unknown): T;
  };
  temperature?: number;
  maxTokens?: number;
  thinking?: DeepSeekThinkingConfig;
  telemetry?: {
    onResponse?: (payload: {
      status: number;
      ok: boolean;
      payload: unknown;
      rawContent: string | null;
    }) => void;
  };
}) => {
  if (!isDeepSeekConfigured(input.apiKey)) {
    throw new DeepSeekNotConfiguredError();
  }

  const baseUrl = input.baseUrl ?? "https://api.deepseek.com";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1200,
      response_format: {
        type: "json_object",
      },
      ...(input.thinking ? { thinking: input.thinking } : {}),
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
    error?: {
      message?: string;
    };
  };
  const content = payload.choices?.[0]?.message?.content ?? null;
  const trimmedContent = typeof content === "string" ? content.trim() : "";

  input.telemetry?.onResponse?.({
    status: response.status,
    ok: response.ok,
    payload,
    rawContent: content,
  });

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `DeepSeek request failed with ${response.status}`);
  }

  if (!trimmedContent) {
    throw new Error("DeepSeek returned an empty JSON response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmedContent);
  } catch (error) {
    const preview = trimmedContent.slice(0, 600);
    throw new Error(
      `DeepSeek returned invalid JSON content: ${error instanceof Error ? error.message : "unknown parse error"}; raw=${preview}`,
    );
  }

  try {
    return input.schema.parse(parsedJson);
  } catch (error) {
    const preview = trimmedContent.slice(0, 600);
    throw new Error(
      `DeepSeek returned invalid structured JSON: ${error instanceof Error ? error.message : "unknown schema error"}; raw=${preview}`,
    );
  }
};
